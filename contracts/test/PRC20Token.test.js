const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('PRC20Token', function () {
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('PRC20Token');
    const token = await Factory.deploy('Test Token', 'TST', 18, 1000000, owner.address);
    await token.waitForDeployment();
    return { token, owner, alice, bob };
  }

  it('mints initial supply to owner', async function () {
    const { token, owner } = await deploy();
    const supply = await token.totalSupply();
    expect(supply).to.equal(ethers.parseUnits('1000000', 18));
    expect(await token.balanceOf(owner.address)).to.equal(supply);
  });

  it('transfers tokens', async function () {
    const { token, owner, alice } = await deploy();
    await token.transfer(alice.address, ethers.parseUnits('100', 18));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseUnits('100', 18));
  });

  it('approve + transferFrom', async function () {
    const { token, owner, alice, bob } = await deploy();
    const amount = ethers.parseUnits('50', 18);
    await token.approve(alice.address, amount);
    await token.connect(alice).transferFrom(owner.address, bob.address, amount);
    expect(await token.balanceOf(bob.address)).to.equal(amount);
  });

  it('burns tokens', async function () {
    const { token, owner } = await deploy();
    const burnAmt = ethers.parseUnits('10', 18);
    const before = await token.totalSupply();
    await token.burn(burnAmt);
    expect(await token.totalSupply()).to.equal(before - burnAmt);
  });

  it('owner can mint', async function () {
    const { token, alice } = await deploy();
    await token.mint(alice.address, ethers.parseUnits('1', 18));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseUnits('1', 18));
  });

  it('reports 18 decimals and metadata', async function () {
    const { token } = await deploy();
    expect(await token.decimals()).to.equal(18);
    expect(await token.name()).to.equal('Test Token');
    expect(await token.symbol()).to.equal('TST');
  });
});
