// Owned synthetic MS-004 fixture; never loaded by the application itself.
import { blankPlan, validatePlan } from '../public/model.js';
import { tagLibrary } from '../public/expense-tags.js';
export function expenseFixture({ tagged = true } = {}) {
  const p = blankPlan('2026-11', '2028-10');
  p.name = 'Synthetic MS-004';
  p.objects = ['Family', 'Child', 'Friends', 'Home', 'Grandparents'].map((name, n) => ({ id: `expense-object-${n}`, name, type: n === 1 || n === 4 ? 'person' : 'group' }));
  const definitions = tagLibrary(p), [category, necessity] = definitions;
  const repeat = (everyMonths = 1, anchor = '2026-11', end = '2027-03') => ({ kind: 'interval', anchor, end, everyMonths });
  const once = anchor => ({ kind: 'once', anchor, end: anchor, everyMonths: 1 });
  const add = (id, owner, amount, recurrence, categoryIndex, necessityIndex, status = 'confirmed', amountChanges = []) => {
    const item = { id, objectId: p.objects[owner].id, name: id, description: `Synthetic ${id}`, type: 'expense', status, amount, recurrence, amountChanges };
    if (tagged) {
      item.tags = [];
      if (categoryIndex !== undefined) item.tags.push({ keyId: category.id, valueId: category.values[categoryIndex].id });
      if (necessityIndex !== undefined) item.tags.push({ keyId: necessity.id, valueId: necessity.values[necessityIndex].id });
    }
    p.items.push(item);
  };
  add('Food', 0, 3000000, repeat(), 0, 0, 'confirmed', [{ month: '2027-01', amount: 3200000 }]);
  add('Class', 1, null, repeat(), 2, 0);
  add('Rent', 3, 8000000, repeat(), 5, 0);
  add('Internet', 3, 400000, repeat(3, '2026-11', '2027-11'), 5, 0);
  add('Picnic', 2, 650000, once('2026-11'), 1, 1);
  add('Gift', 2, null, once('2026-11'));
  add('Free', 0, 0, once('2026-11'), 0);
  add('Trip', 0, 1800000, once('2026-11'), 1, 1, 'tentative');
  add('Books', 1, 450000, once('2026-12'));
  add('Future', 1, null, once('2027-01'));
  add('Insurance', 0, 2400000, repeat(12, '2027-04', '2029-04'));
  if (tagged) p.tagDefinitions = definitions;
  return validatePlan(p);
}
