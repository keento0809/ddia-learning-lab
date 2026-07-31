type Order = { orderId: string; customerId: string; item: string };
type Customer = { customerId: string; name: string };

type OrderValue = { type: "order"; orderId: string; item: string };
type CustomerValue = { type: "customer"; name: string };
type JoinValue = OrderValue | CustomerValue;

type JoinedRecord = { orderId: string; item: string; customerId: string; customerName: string };

export function mapOrders(orders: Order[]): [string, OrderValue][] {
  return orders.map((order) => [
    order.customerId,
    { type: "order", orderId: order.orderId, item: order.item },
  ]);
}

export function mapCustomers(customers: Customer[]): [string, CustomerValue][] {
  return customers.map((customer) => [customer.customerId, { type: "customer", name: customer.name }]);
}

export function shuffleJoin(
  customerPairs: [string, JoinValue][],
  orderPairs: [string, JoinValue][],
): [string, JoinValue[]][] {
  const groups = new Map<string, JoinValue[]>();
  for (const [key, value] of [...customerPairs, ...orderPairs]) {
    const existing = groups.get(key);
    if (existing) {
      existing.push(value);
    } else {
      groups.set(key, [value]);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function reduceJoin(groups: [string, JoinValue[]][]): JoinedRecord[] {
  const result: JoinedRecord[] = [];
  for (const [customerId, values] of groups) {
    const customerEntry = values.find((value): value is CustomerValue => value.type === "customer");
    if (!customerEntry) continue;
    for (const value of values) {
      if (value.type === "order") {
        result.push({
          orderId: value.orderId,
          item: value.item,
          customerId,
          customerName: customerEntry.name,
        });
      }
    }
  }
  return result;
}

export function joinOrdersWithCustomers(orders: Order[], customers: Customer[]): JoinedRecord[] {
  const orderPairs = mapOrders(orders);
  const customerPairs = mapCustomers(customers);
  const groups = shuffleJoin(customerPairs, orderPairs);
  return reduceJoin(groups);
}
