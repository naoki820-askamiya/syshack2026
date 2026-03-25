const results: any[] = []

export const create = async (data: any) => {
  const newResult = {
    id: "result_" + Date.now(),
    ...data,
    createdAt: new Date().toISOString()
  }

  results.push(newResult)
  return newResult
}

export const findByCaseId = async (caseId: string) => {
  return results.find(r => r.analysisCaseId === caseId) || null
}