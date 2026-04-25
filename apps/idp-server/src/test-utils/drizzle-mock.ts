import { vi } from "vitest";

export const createDrizzleMock = () => {
  const mock: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    transaction: vi.fn(async (cb) => cb(mock)),
    execute: vi.fn(),
    // thenable mock: Use a named function to avoid Vitest confusing it with a real promise too early
    // biome-ignore lint/suspicious/noThenProperty: Drizzle queries are thenable by design
    then: vi.fn(function (this: any, resolve: any) {
      return Promise.resolve([]).then(resolve);
    }),
  };
  return mock;
};
