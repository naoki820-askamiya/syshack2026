/**
 * DB操作のみを担当
 * - ビジネスロジックは書かない
 */

export const create = async (data: any) => {
  return await db.person.create({
    data,
  });
};