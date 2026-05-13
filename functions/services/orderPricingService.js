export function getOrderPricing(ticketQuantity) {
  if (ticketQuantity === 15) {
    return { discount: 0.1, freeTickets: 1, packType: "Pack Prestige" };
  }

  if (ticketQuantity === 20) {
    return { discount: 0.15, freeTickets: 2, packType: "Pack Elite" };
  }

  if (ticketQuantity === 25) {
    return { discount: 0.2, freeTickets: 2, packType: "Pack Gold" };
  }

  if (ticketQuantity === 50) {
    return { discount: 0.25, freeTickets: 5, packType: "Pack Diamond" };
  }

  return {
    discount: 0,
    freeTickets: Math.floor(ticketQuantity / 10),
    packType: "Single",
  };
}
