const persons: any[] = []

export const findById = async (personId: string) => {
  return persons.find(p => p.id === personId) || null
}