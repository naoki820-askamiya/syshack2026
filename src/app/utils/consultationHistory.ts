import type { ConsultationData } from '../types.js';

function createdAtMillis(consultation: ConsultationData): number {
  return new Date(consultation.createdAt).getTime();
}

export function findLatestConsultationByPersonId(
  consultations: ConsultationData[], personId: string,
): ConsultationData | undefined {
  return consultations.filter(c => c.personId === personId)
    .sort((a, b) => createdAtMillis(b) - createdAtMillis(a))[0];
}

// Legacy name links can be resolved only when they identify exactly one person.
export function findLatestConsultationByPersonName(
  consultations: ConsultationData[], personName: string,
): ConsultationData | undefined {
  const matches = getLatestConsultationsByPerson(consultations).filter(c => c.personName === personName);
  return matches.length === 1 ? matches[0] : undefined;
}

export function getLatestConsultationsByPerson(consultations: ConsultationData[]): ConsultationData[] {
  const latestByPerson = new Map<string, ConsultationData>();
  [...consultations].sort((a, b) => createdAtMillis(a) - createdAtMillis(b))
    .forEach(c => latestByPerson.set(c.personId ?? `case:${c.id}`, c));
  return Array.from(latestByPerson.values()).sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
}
