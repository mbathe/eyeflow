/**
 * Universal mock factory for TypeORM repositories.
 *
 * Usage:
 *   .overrideProvider(getRepositoryToken(MyEntity))
 *   .useValue(createMockRepo<MyEntity>())
 *
 * All methods are jest.fn() so individual tests can override them:
 *   mockConnectorRepo.findOne.mockResolvedValue({ id: '1', name: 'test' });
 */

export type MockRepository<T = any> = {
  find: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
  findAndCount: jest.Mock;
  findBy: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  remove: jest.Mock;
  softDelete: jest.Mock;
  count: jest.Mock;
  countBy: jest.Mock;
  exist: jest.Mock;
  existsBy: jest.Mock;
  createQueryBuilder: jest.Mock;
  manager: {
    transaction: jest.Mock;
  };
};

/** Creates a fresh mock repository with sensible defaults */
export function createMockRepo<T = any>(
  defaultEntity?: Partial<T>,
): MockRepository<T> {
  const entity = defaultEntity ?? ({} as Partial<T>);

  const mockQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
    getCount: jest.fn().mockResolvedValue(0),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findBy: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation(async (ent: any) => ({
      ...entity,
      ...ent,
    })),
    create: jest.fn().mockImplementation((data: any) => ({ ...entity, ...data })),
    update: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
    delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    remove: jest.fn().mockImplementation(async (ent: any) => ent),
    softDelete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    count: jest.fn().mockResolvedValue(0),
    countBy: jest.fn().mockResolvedValue(0),
    exist: jest.fn().mockResolvedValue(false),
    existsBy: jest.fn().mockResolvedValue(false),
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    manager: {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb({})),
    },
  };
}
