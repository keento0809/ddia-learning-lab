interface User {
  id: number;
  name: string;
}

interface Order {
  id: number;
  userId: number;
  item: string;
}

export function denormalizeUsers(users: User[], orders: Order[]) {
  const ordersByUserId = new Map<number, Order[]>();
  for (const order of orders) {
    const existing = ordersByUserId.get(order.userId);
    if (existing) {
      existing.push(order);
    } else {
      ordersByUserId.set(order.userId, [order]);
    }
  }

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    orders: ordersByUserId.get(user.id) ?? [],
  }));
}
