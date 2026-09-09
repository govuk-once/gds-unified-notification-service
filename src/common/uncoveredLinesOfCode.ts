export function calculateDiscount(price: number, customerType: string, isFirstOrder: boolean): number {
  if (price <= 0) {
    throw new Error('Price must be greater than zero');
  }

  let discount = 0.0;

  if (customerType === 'VIP') {
    discount += 0.2;
    if (isFirstOrder) discount += 0.05;
  } else if (customerType === 'REGULAR') {
    discount += 0.1;
    if (isFirstOrder) discount += 0.02;
  } else if (customerType === 'GUEST') {
    if (isFirstOrder) discount += 0.01;
  } else {
    discount = 0.0;
  }

  if (discount > 0.25) {
    discount = 0.25;
  }

  return Number((price * (1 - discount)).toFixed(2));
}

export function calculateAnotherDiscount(price: number, customerType: string, isFirstOrder: boolean): number {
  if (price <= 0) {
    throw new Error('Price must be greater than zero');
  }

  let discount = 0.0;

  if (customerType === 'VIP') {
    discount += 0.2;
    if (isFirstOrder) discount += 0.05;
  } else if (customerType === 'REGULAR') {
    discount += 0.1;
    if (isFirstOrder) discount += 0.02;
  } else if (customerType === 'GUEST') {
    if (isFirstOrder) discount += 0.01;
  } else {
    discount = 0.0;
  }

  if (discount > 0.25) {
    discount = 0.25;
  }

  return Number((price * (1 - discount)).toFixed(2));
}
