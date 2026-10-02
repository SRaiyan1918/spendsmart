import { getGoalAllocationAmount } from './financeLogic';

// Used both for the offline projection and for replay against current server data.
export function applyFinancialCommand(command, target) {
  if (!target) { const error = new Error('Savings/udhar item ab available nahi hai.'); error.code = 'target-missing'; throw error; }
  if (!Number.isFinite(command.amount) || command.amount <= 0) throw new Error('Invalid amount.');
  const common = { id: command.id, type: 'transfer', date: command.date, createdAt: command.createdAt };
  if (command.type === 'goal') {
    const actual = getGoalAllocationAmount(command.amount, target.targetAmount, target.savedAmount || 0);
    if (actual <= 0) { const error = new Error('Goal already complete.'); error.code = 'goal-complete'; throw error; }
    const savedAmount = Number(target.savedAmount || 0) + actual;
    const complete = savedAmount >= Number(target.targetAmount);
    return {
      actual,
      patch: { savedAmount, archived: complete, ...(complete ? { completedAt: command.date } : {}) },
      transaction: {
        ...common, direction: 'out', transferKind: 'savings', isSavingsAllocation: true,
        goalId: command.targetId, category: `🏦 ${target.emoji || '🎯'} ${target.title}`,
        amount: actual, note: 'Savings Goal Allocation',
      },
    };
  }
  if (command.type !== 'loan') throw new Error('Unknown financial command.');
  const remaining = Math.max(0, Number(target.amount) - Number(target.returned || 0));
  if (command.amount > remaining) { const error = new Error(`Remaining sirf ₹${remaining.toFixed(2)} hai. Return sync nahi hua.`); error.code = 'loan-overpayment'; throw error; }
  const returned = Number(target.returned || 0) + command.amount;
  const complete = returned >= Number(target.amount);
  const given = target.type === 'gave';
  return {
    actual: command.amount,
    patch: {
      returned, status: complete ? 'completed' : 'active', completedAt: complete ? command.date : null,
      returns: [...(target.returns || []), { amount: command.amount, date: command.date }],
    },
    transaction: {
      ...common, direction: given ? 'in' : 'out', transferKind: given ? 'loan_returned' : 'loan_repaid',
      category: given ? '🤝 Udhar Wapas' : '🤝 Udhar Chukaya', amount: command.amount,
      note: given ? `Udhar wapas mila: ${target.name}` : `Udhar chukaya: ${target.name}`, udharId: command.targetId,
    },
  };
}

export function projectFinancialCommands(goals, loans, transactions, commands) {
  const result = { goals: goals.map(item => ({ ...item })), loans: loans.map(item => ({ ...item })), transactions: [...transactions] };
  const receipts = new Set(transactions.map(item => item.id));
  for (const command of commands) {
    if (receipts.has(command.id)) continue;
    const items = command.type === 'goal' ? result.goals : result.loans;
    const target = items.find(item => item.id === command.targetId);
    try {
      const applied = applyFinancialCommand(command, target);
      Object.assign(target, applied.patch);
      result.transactions.push(applied.transaction);
      receipts.add(command.id);
    } catch {
      // Keep the durable command; replay reports conflicts rather than manufacturing a balance.
    }
  }
  return result;
}
