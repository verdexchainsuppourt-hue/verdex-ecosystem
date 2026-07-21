const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Verdex mainnet fixed-supply asset and P2P escrow', function () {
  async function deploy() {
    const [governance, seller, buyer, arbiterOne, arbiterTwo, arbiterThree, attestor, relayer] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('VerdexMainnetVDX');
    const token = await Token.deploy(governance.address);
    await token.waitForDeployment();

    const Escrow = await ethers.getContractFactory('VerdexP2PEscrow');
    const escrow = await Escrow.deploy(
      await token.getAddress(),
      governance.address,
      [arbiterOne.address, arbiterTwo.address, arbiterThree.address],
      [attestor.address],
      2
    );
    await escrow.waitForDeployment();

    await token.transfer(seller.address, ethers.parseEther('1000'));
    await token.connect(seller).approve(await escrow.getAddress(), ethers.MaxUint256);
    return { token, escrow, governance, seller, buyer, arbiterOne, arbiterTwo, arbiterThree, attestor, relayer };
  }

  async function signTradeAuthorization(escrow, seller, buyer, attestor, authorization) {
    const network = await ethers.provider.getNetwork();
    return attestor.signTypedData({
      name: 'Verdex P2P Escrow',
      version: '1',
      chainId: Number(network.chainId),
      verifyingContract: await escrow.getAddress()
    }, {
      TradeAuthorization: [
        { name: 'seller', type: 'address' },
        { name: 'buyer', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'paymentDeadline', type: 'uint64' },
        { name: 'tradeReference', type: 'bytes32' },
        { name: 'authorizationDeadline', type: 'uint256' }
      ]
    }, authorization);
  }

  async function createTrade(escrow, seller, buyer, attestor, options = {}) {
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const amount = options.amount ?? ethers.parseEther('100');
    const paymentDeadline = options.paymentDeadline ?? now + 3_600;
    const authorizationDeadline = options.authorizationDeadline ?? now + 600;
    const tradeReference = options.tradeReference ?? ethers.keccak256(ethers.toUtf8Bytes(`private-trade-${now}`));
    const authorization = {
      seller: seller.address,
      buyer: buyer.address,
      amount,
      paymentDeadline,
      tradeReference,
      authorizationDeadline
    };
    const signature = await signTradeAuthorization(escrow, seller, buyer, attestor, authorization);
    const tx = await escrow.connect(seller).createEscrow(
      buyer.address, amount, paymentDeadline, tradeReference, authorizationDeadline, signature
    );
    const receipt = await tx.wait();
    const log = receipt.logs
      .map((entry) => {
        try { return escrow.interface.parseLog(entry); } catch { return null; }
      })
      .find((entry) => entry && entry.name === 'EscrowCreated');
    return { escrowId: log.args.escrowId, paymentDeadline, amount, tradeReference, authorizationDeadline, signature };
  }

  async function signResolution(escrow, escrowId, recipient, deadline, arbiters, resolutionNonce = 0) {
    const network = await ethers.provider.getNetwork();
    const domain = {
      name: 'Verdex P2P Escrow',
      version: '1',
      chainId: Number(network.chainId),
      verifyingContract: await escrow.getAddress()
    };
    const types = {
      EscrowResolution: [
        { name: 'escrowId', type: 'bytes32' },
        { name: 'recipient', type: 'address' },
        { name: 'resolutionNonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };
    const decision = { escrowId, recipient, resolutionNonce, deadline };
    return Promise.all(arbiters.map((arbiter) => arbiter.signTypedData(domain, types, decision)));
  }

  it('mints exactly one billion VDX once, with no minter or owner surface', async function () {
    const { token, governance } = await deploy();
    expect(await token.totalSupply()).to.equal(ethers.parseEther('1000000000'));
    expect(await token.balanceOf(governance.address)).to.equal(ethers.parseEther('999999000'));
    expect(token.interface.fragments.some((fragment) => fragment.type === 'function' && fragment.name === 'mint')).to.equal(false);
    expect(token.interface.fragments.some((fragment) => fragment.type === 'function' && fragment.name === 'owner')).to.equal(false);
  });

  it('releases VDX only after the buyer marks payment and the seller releases', async function () {
    const { token, escrow, seller, buyer, attestor } = await deploy();
    const { escrowId, amount } = await createTrade(escrow, seller, buyer, attestor);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount);
    await escrow.connect(buyer).markPayment(escrowId);
    await expect(escrow.connect(buyer).release(escrowId)).to.be.revertedWithCustomError(escrow, 'NotEscrowSeller');
    await escrow.connect(seller).release(escrowId);
    expect(await token.balanceOf(buyer.address)).to.equal(amount);
    expect((await escrow.getEscrow(escrowId)).state).to.equal(4);
  });

  it('requires a current, one-time in-house trade authorization before funding', async function () {
    const { escrow, seller, buyer, attestor } = await deploy();
    const trade = await createTrade(escrow, seller, buyer, attestor);
    await expect(escrow.connect(seller).createEscrow(
      buyer.address,
      trade.amount,
      trade.paymentDeadline,
      trade.tradeReference,
      trade.authorizationDeadline,
      trade.signature
    )).to.be.revertedWithCustomError(escrow, 'TradeAuthorizationAlreadyConsumed');
  });

  it('permanently reserves an opaque trade reference even with a new attestation', async function () {
    const { escrow, seller, buyer, attestor } = await deploy();
    const tradeReference = ethers.keccak256(ethers.toUtf8Bytes('private-trade-reference-once'));
    await createTrade(escrow, seller, buyer, attestor, { tradeReference });

    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const authorization = {
      seller: seller.address,
      buyer: buyer.address,
      amount: ethers.parseEther('100'),
      paymentDeadline: now + 3_600,
      tradeReference,
      authorizationDeadline: now + 600
    };
    const signature = await signTradeAuthorization(escrow, seller, buyer, attestor, authorization);
    await expect(escrow.connect(seller).createEscrow(
      buyer.address,
      authorization.amount,
      authorization.paymentDeadline,
      tradeReference,
      authorization.authorizationDeadline,
      signature
    )).to.be.revertedWithCustomError(escrow, 'TradeReferenceAlreadyUsed');
    expect(await escrow.usedTradeReferences(tradeReference)).to.equal(true);
  });

  it('bounds a trade attestation lifetime before funds can be locked', async function () {
    const { escrow, seller, buyer, attestor } = await deploy();
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const authorization = {
      seller: seller.address,
      buyer: buyer.address,
      amount: ethers.parseEther('100'),
      paymentDeadline: now + 3_600,
      tradeReference: ethers.keccak256(ethers.toUtf8Bytes('overlong-trade-attestation')),
      authorizationDeadline: now + Number(await escrow.MAX_TRADE_AUTHORIZATION_VALIDITY()) + 60
    };
    const signature = await signTradeAuthorization(escrow, seller, buyer, attestor, authorization);
    await expect(escrow.connect(seller).createEscrow(
      buyer.address,
      authorization.amount,
      authorization.paymentDeadline,
      authorization.tradeReference,
      authorization.authorizationDeadline,
      signature
    )).to.be.revertedWithCustomError(escrow, 'InvalidTradeAuthorizationDeadline');
  });

  it('uses a delayed, two-step default-admin transfer compatible with a governance timelock', async function () {
    const { escrow, governance, relayer, arbiterOne } = await deploy();
    const pauserRole = await escrow.PAUSER_ROLE();
    const transferDelay = await escrow.DEFAULT_ADMIN_TRANSFER_DELAY();

    expect(await escrow.defaultAdmin()).to.equal(governance.address);
    await expect(escrow.connect(governance).grantRole(pauserRole, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(escrow, 'InvalidAddress');
    await escrow.connect(governance).beginDefaultAdminTransfer(relayer.address);
    const [pendingAdmin, schedule] = await escrow.pendingDefaultAdmin();
    expect(pendingAdmin).to.equal(relayer.address);
    expect(schedule).to.be.greaterThan(0);
    await expect(escrow.connect(relayer).acceptDefaultAdminTransfer())
      .to.be.revertedWithCustomError(escrow, 'AccessControlEnforcedDefaultAdminDelay');

    await ethers.provider.send('evm_increaseTime', [Number(transferDelay) + 1]);
    await ethers.provider.send('evm_mine');
    await escrow.connect(relayer).acceptDefaultAdminTransfer();
    expect(await escrow.defaultAdmin()).to.equal(relayer.address);

    await expect(escrow.connect(governance).grantRole(pauserRole, arbiterOne.address))
      .to.be.revertedWithCustomError(escrow, 'AccessControlUnauthorizedAccount');
    await escrow.connect(relayer).grantRole(pauserRole, arbiterOne.address);
    expect(await escrow.hasRole(pauserRole, arbiterOne.address)).to.equal(true);
  });

  it('separates emergency pause from unpause and lets a party freeze an in-flight trade', async function () {
    const { escrow, governance, seller, buyer, arbiterOne, arbiterTwo, attestor, relayer } = await deploy();
    const { escrowId } = await createTrade(escrow, seller, buyer, attestor);
    const pauserRole = await escrow.PAUSER_ROLE();
    await escrow.connect(governance).grantRole(pauserRole, arbiterOne.address);
    await escrow.connect(arbiterOne).pause();

    await expect(escrow.connect(arbiterOne).unpause())
      .to.be.revertedWithCustomError(escrow, 'AccessControlUnauthorizedAccount');
    await expect(escrow.connect(buyer).markPayment(escrowId))
      .to.be.revertedWithCustomError(escrow, 'EnforcedPause');

    await escrow.connect(buyer).openDispute(escrowId);
    expect((await escrow.getEscrow(escrowId)).state).to.equal(3);

    const deadline = (await ethers.provider.getBlock('latest')).timestamp + 3_600;
    const signatures = await signResolution(
      escrow, escrowId, buyer.address, deadline, [arbiterOne, arbiterTwo]
    );
    await expect(escrow.connect(relayer).resolveDispute(escrowId, buyer.address, 0, deadline, signatures))
      .to.be.revertedWithCustomError(escrow, 'EnforcedPause');

    await escrow.connect(governance).unpause();
    await escrow.connect(relayer).resolveDispute(escrowId, buyer.address, 0, deadline, signatures);
    expect((await escrow.getEscrow(escrowId)).state).to.equal(4);
  });

  it('bounds dispute decision signatures and the arbitration verification workload', async function () {
    const { escrow, seller, buyer, arbiterOne, arbiterTwo, attestor, relayer } = await deploy();
    const { escrowId } = await createTrade(escrow, seller, buyer, attestor);
    await escrow.connect(buyer).openDispute(escrowId);

    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const tooDistantDeadline = now + Number(await escrow.MAX_RESOLUTION_SIGNATURE_VALIDITY()) + 60;
    const signatures = await signResolution(
      escrow, escrowId, buyer.address, tooDistantDeadline, [arbiterOne, arbiterTwo]
    );
    await expect(escrow.connect(relayer).resolveDispute(
      escrowId, buyer.address, 0, tooDistantDeadline, signatures
    )).to.be.revertedWithCustomError(escrow, 'ResolutionSignatureDeadlineTooFar');

    const boundedDeadline = now + 3_600;
    const tooManySignatures = new Array(Number(await escrow.MAX_ARBITRATION_QUORUM()) + 1).fill('0x');
    await expect(escrow.connect(relayer).resolveDispute(
      escrowId, buyer.address, 0, boundedDeadline, tooManySignatures
    )).to.be.revertedWithCustomError(escrow, 'TooManyArbiterSignatures');
  });

  it('refunds only after an unmarked payment window expires', async function () {
    const { token, escrow, seller, buyer, attestor } = await deploy();
    const { escrowId, amount } = await createTrade(escrow, seller, buyer, attestor);
    await expect(escrow.refundExpired(escrowId)).to.be.revertedWithCustomError(escrow, 'PaymentWindowNotExpired');
    await ethers.provider.send('evm_increaseTime', [3_601]);
    await ethers.provider.send('evm_mine');
    await escrow.connect(buyer).refundExpired(escrowId);
    expect(await token.balanceOf(seller.address)).to.equal(ethers.parseEther('1000'));
    expect((await escrow.getEscrow(escrowId)).state).to.equal(5);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0);
    expect(amount).to.equal(ethers.parseEther('100'));
  });

  it('requires threshold-distinct arbiters to resolve a disputed trade', async function () {
    const { token, escrow, seller, buyer, arbiterOne, arbiterTwo, attestor, relayer } = await deploy();
    const { escrowId, amount } = await createTrade(escrow, seller, buyer, attestor);
    await escrow.connect(buyer).markPayment(escrowId);
    await escrow.connect(seller).openDispute(escrowId);

    const deadline = (await ethers.provider.getBlock('latest')).timestamp + 3_600;
    const signatures = await signResolution(
      escrow, escrowId, buyer.address, deadline, [arbiterOne, arbiterTwo]
    );

    await escrow.connect(relayer).resolveDispute(escrowId, buyer.address, 0, deadline, signatures);
    expect(await token.balanceOf(buyer.address)).to.equal(amount);
    expect((await escrow.getEscrow(escrowId)).state).to.equal(4);
  });

  it('cannot let governance remove arbiters below the active dispute quorum', async function () {
    const { escrow, governance, arbiterOne, arbiterTwo } = await deploy();
    const role = await escrow.ARBITER_ROLE();
    await escrow.connect(governance).revokeRole(role, arbiterOne.address);
    await expect(escrow.connect(governance).revokeRole(role, arbiterTwo.address))
      .to.be.revertedWithCustomError(escrow, 'ArbitrationQuorumWouldBeBroken');
  });
});
