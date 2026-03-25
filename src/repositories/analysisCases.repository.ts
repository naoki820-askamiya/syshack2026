// 仮DB
const analysisCases: any[] = []

// 作成
export const create = async (data: any) => {
  const newCase = {
    id: "case_" + Date.now(),
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  analysisCases.push(newCase)
  return newCase
}

// 取得
export const findById = async (caseId: string) => {
  return analysisCases.find(c => c.id === caseId) || null
}

// status更新
export const updateStatus = async (caseId: string, status: string) => {
  const target = analysisCases.find(c => c.id === caseId)
  if (!target) return null

  target.status = status
  target.updatedAt = new Date().toISOString()

  return target
}

// person別取得
export const findByPersonId = async (
  personId: string,
  { limit, offset }: { limit: number; offset: number }
) => {
  const filtered = analysisCases.filter(c => c.personId === personId)

  return {
    analysisCases: filtered.slice(offset, offset + limit),
    pagination: {
      hasMore: filtered.length > offset + limit
    }
  }
}