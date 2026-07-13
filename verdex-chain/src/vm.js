class ContractVM {
  constructor() {}

  /**
   * Execute smart contract method
   * @param {string} code Contract JS code
   * @param {string} methodName Method to execute (or 'deploy' for constructor/init)
   * @param {Array} args Arguments for the method
   * @param {Object} context Execution context (sender, value, balance, storage)
   */
  execute(code, methodName, args = [], context = {}) {
    const logs = [];
    const transfers = [];

    const sandbox = {
      storage: context.storage || {},
      balance: context.balance || '0',
      msg: {
        sender: context.sender,
        value: context.value || '0'
      },
      transfer: (to, amount) => {
        if (typeof amount !== 'string' && typeof amount !== 'number' && typeof amount !== 'bigint') {
          throw new Error('Transfer amount must be a string, number, or bigint');
        }
        const amt = BigInt(amount);
        if (amt <= 0n) throw new Error('Transfer amount must be positive');
        
        transfers.push({ to, value: amt.toString() });
      },
      logs: logs
    };

    try {
      // Execute the contract script
      const wrapper = new Function('sandbox', `
        const { storage, balance, msg, transfer, logs } = sandbox;
        const console = {
          log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '))
        };
        
        ${code}

        if (typeof Contract !== 'undefined') {
          const instance = new Contract();
          instance.storage = storage;
          instance.balance = balance;
          instance.msg = msg;
          instance.transfer = transfer;
          instance.console = console;

          if (typeof instance['init'] === 'function' && '${methodName}' === 'deploy') {
            instance['init'](...${JSON.stringify(args)});
          } else if (typeof instance['${methodName}'] === 'function') {
            const result = instance['${methodName}'](...${JSON.stringify(args)});
            return { result, storage: instance.storage };
          } else if ('${methodName}' !== 'deploy') {
            throw new Error('Method ${methodName} not found in Contract');
          }
          return { result: null, storage: instance.storage };
        }

        // Simple function execution fallback
        if (typeof ${methodName} === 'function') {
          const result = ${methodName}(...${JSON.stringify(args)});
          return { result, storage };
        } else if ('${methodName}' !== 'deploy') {
          throw new Error('Function ${methodName} not found');
        }
        return { result: null, storage };
      `);

      const executionResult = wrapper(sandbox);
      return {
        success: true,
        result: executionResult.result,
        storage: executionResult.storage,
        transfers,
        logs
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        logs
      };
    }
  }
}

module.exports = ContractVM;
