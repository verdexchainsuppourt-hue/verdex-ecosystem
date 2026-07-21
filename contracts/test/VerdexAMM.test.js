const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Verdex AMM Suite', function () {
  let owner, alice, bob, treasury;
  let tokenA, tokenB, tokenC, wvdX;
  let factory, router, aggregator, feeSplitter;

  const DEAD = '0x000000000000000000000000000000000000dEaD';
  const parse = (n) => ethers.parseUnits(String(n), 18);

  async function deadline(seconds = 600) {
    const block = await ethers.provider.getBlock('latest');
    return block.timestamp + seconds;
  }

  beforeEach(async function () {
    [owner, alice, bob, treasury] = await ethers.getSigners();

    const PRC20 = await ethers.getContractFactory('PRC20Token');
    tokenA = await PRC20.deploy('Alpha', 'ALP', 18, 1_000_000, owner.address);
    tokenB = await PRC20.deploy('Beta', 'BET', 18, 1_000_000, owner.address);
    tokenC = await PRC20.deploy('Gamma', 'GAM', 18, 1_000_000, owner.address);
    await Promise.all([tokenA.waitForDeployment(), tokenB.waitForDeployment(), tokenC.waitForDeployment()]);

    const WVDX = await ethers.getContractFactory('WVDX');
    wvdX = await WVDX.deploy();
    await wvdX.waitForDeployment();

    const Factory = await ethers.getContractFactory('VerdexFactory');
    factory = await Factory.deploy(owner.address, treasury.address, DEAD);
    await factory.waitForDeployment();

    const FeeSplitter = await ethers.getContractFactory('VerdexFeeSplitter');
    feeSplitter = await FeeSplitter.deploy(await factory.getAddress());
    await feeSplitter.waitForDeployment();
    await factory.setFeeTo(await feeSplitter.getAddress());

    const Router = await ethers.getContractFactory('VerdexRouter');
    router = await Router.deploy(await factory.getAddress(), await wvdX.getAddress());
    await router.waitForDeployment();

    const Aggregator = await ethers.getContractFactory('VerdexAggregator');
    aggregator = await Aggregator.deploy(
      await factory.getAddress(),
      await router.getAddress(),
      await wvdX.getAddress()
    );
    await aggregator.waitForDeployment();

    // Fund alice
    for (const t of [tokenA, tokenB, tokenC]) {
      await t.transfer(alice.address, parse(10_000));
      await t.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
      await t.connect(alice).approve(await aggregator.getAddress(), ethers.MaxUint256);
      await t.approve(await router.getAddress(), ethers.MaxUint256);
    }
  });

  describe('Factory fee config', function () {
    it('exposes Verdex 0.25% fee splits', async function () {
      expect(await factory.TOTAL_FEE_BPS()).to.equal(25);
      expect(await factory.LP_FEE_BPS()).to.equal(17);
      expect(await factory.TREASURY_FEE_BPS()).to.equal(5);
      expect(await factory.BURN_FEE_BPS()).to.equal(3);
      expect(await factory.treasury()).to.equal(treasury.address);
      expect(await factory.burnAddress()).to.equal(DEAD);
    });

    it('creates unique pairs via CREATE2', async function () {
      const tx = await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
      await tx.wait();
      const pair = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      expect(pair).to.not.equal(ethers.ZeroAddress);
      expect(await factory.allPairsLength()).to.equal(1);
      await expect(factory.createPair(await tokenA.getAddress(), await tokenB.getAddress())).to.be.revertedWith(
        'Verdex: PAIR_EXISTS'
      );
    });
  });

  describe('Liquidity + swap math', function () {
    async function seedAB(amountA = 1000, amountB = 1000) {
      await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        parse(amountA),
        parse(amountB),
        0,
        0,
        owner.address,
        await deadline()
      );
    }

    it('adds liquidity and mints LP tokens', async function () {
      await seedAB();
      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      const pair = await ethers.getContractAt('VerdexPair', pairAddr);
      const lp = await pair.balanceOf(owner.address);
      expect(lp).to.be.gt(0);
    });

    it('getAmountOut applies 0.25% fee (9975/10000)', async function () {
      // amountIn=100, reserves 1000/1000
      // out = (100 * 9975 * 1000) / (1000 * 10000 + 100 * 9975) = 997500000 / 10997500 ≈ 90.703
      const out = await router.getAmountOut(parse(100), parse(1000), parse(1000));
      const expectedNum = parse(100) * 9975n * parse(1000);
      const expectedDen = parse(1000) * 10000n + parse(100) * 9975n;
      expect(out).to.equal(expectedNum / expectedDen);
    });

    it('swaps exact tokens with slippage guard', async function () {
      await seedAB(5000, 5000);
      const path = [await tokenA.getAddress(), await tokenB.getAddress()];
      const amountIn = parse(10);
      const amounts = await router.getAmountsOut(amountIn, path);
      const balBefore = await tokenB.balanceOf(alice.address);

      await router.connect(alice).swapExactTokensForTokens(
        amountIn,
        amounts[1], // exact min = quote (no extra slippage)
        path,
        alice.address,
        await deadline()
      );

      const balAfter = await tokenB.balanceOf(alice.address);
      expect(balAfter - balBefore).to.equal(amounts[1]);
    });

    it('reverts when output below amountOutMin', async function () {
      await seedAB(5000, 5000);
      const path = [await tokenA.getAddress(), await tokenB.getAddress()];
      const amountIn = parse(10);
      const amounts = await router.getAmountsOut(amountIn, path);
      await expect(
        router.connect(alice).swapExactTokensForTokens(
          amountIn,
          amounts[1] + 1n,
          path,
          alice.address,
          await deadline()
        )
      ).to.be.revertedWith('VerdexRouter: INSUFFICIENT_OUTPUT_AMOUNT');
    });

    it('supports multi-hop A → B → C', async function () {
      await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        parse(2000),
        parse(2000),
        0,
        0,
        owner.address,
        await deadline()
      );
      await router.addLiquidity(
        await tokenB.getAddress(),
        await tokenC.getAddress(),
        parse(2000),
        parse(2000),
        0,
        0,
        owner.address,
        await deadline()
      );

      const path = [await tokenA.getAddress(), await tokenB.getAddress(), await tokenC.getAddress()];
      const amountIn = parse(5);
      const amounts = await router.getAmountsOut(amountIn, path);
      expect(amounts[2]).to.be.gt(0);

      const before = await tokenC.balanceOf(alice.address);
      await router.connect(alice).swapExactTokensForTokens(amountIn, 0, path, alice.address, await deadline());
      expect(await tokenC.balanceOf(alice.address)).to.equal(before + amounts[2]);
    });
  });

  describe('Aggregator routing', function () {
    beforeEach(async function () {
      // Direct A-C is thin; multi-hop A-B-C is deep → aggregator should prefer multi-hop
      await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenC.getAddress(),
        parse(50),
        parse(50),
        0,
        0,
        owner.address,
        await deadline()
      );
      await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        parse(5000),
        parse(5000),
        0,
        0,
        owner.address,
        await deadline()
      );
      await router.addLiquidity(
        await tokenB.getAddress(),
        await tokenC.getAddress(),
        parse(5000),
        parse(5000),
        0,
        0,
        owner.address,
        await deadline()
      );
      await aggregator.setHopTokens([await tokenB.getAddress(), await wvdX.getAddress()]);
    });

    it('finds best route (multi-hop beats thin direct)', async function () {
      const amountIn = parse(10);
      const [path, bestOut] = await aggregator.findBestRoute(
        await tokenA.getAddress(),
        await tokenC.getAddress(),
        amountIn
      );

      const direct = await router.getAmountsOut(amountIn, [
        await tokenA.getAddress(),
        await tokenC.getAddress()
      ]);
      expect(path.length).to.be.gte(2);
      expect(bestOut).to.be.gte(direct[1]);
      // With thin direct pool, multi-hop should win
      expect(bestOut).to.be.gt(direct[1]);
      expect(path.length).to.equal(3);
    });

    it('executes best-path swap with slippage protection', async function () {
      const amountIn = parse(10);
      const [, quoteOut] = await aggregator.quoteBest(
        await tokenA.getAddress(),
        await tokenC.getAddress(),
        amountIn
      );
      const before = await tokenC.balanceOf(alice.address);
      const minOut = (quoteOut * 99n) / 100n; // 1% slippage

      await aggregator.connect(alice).swapExactTokensForTokensBest(
        await tokenA.getAddress(),
        await tokenC.getAddress(),
        amountIn,
        minOut,
        alice.address,
        await deadline()
      );

      const got = (await tokenC.balanceOf(alice.address)) - before;
      expect(got).to.be.gte(minOut);
    });

    it('exposes feeInfo for frontends', async function () {
      const info = await aggregator.feeInfo();
      expect(info.totalBps).to.equal(25);
      expect(info.lpBps).to.equal(17);
      expect(info.treasuryBps).to.equal(5);
      expect(info.burnBps).to.equal(3);
      expect(info.treasury).to.equal(treasury.address);
      expect(info.burn).to.equal(DEAD);
    });
  });

  describe('WVDX wrap', function () {
    it('deposits and withdraws native value', async function () {
      await wvdX.connect(alice).deposit({ value: parse(1) });
      expect(await wvdX.balanceOf(alice.address)).to.equal(parse(1));
      await wvdX.connect(alice).withdraw(parse(1));
      expect(await wvdX.balanceOf(alice.address)).to.equal(0);
    });
  });
});
