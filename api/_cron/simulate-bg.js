/** Retired: mainnet blocks and transactions must never be simulated by Vercel. */
module.exports = async () => {
  throw new Error('Legacy chain simulation is retired.');
};
