import type { ConsultationData } from '../types.js';

function createdAtMillis(consultation: ConsultationData): number {
  return new Date(consultation.createdAt).getTime();
}

export function findLatestConsultationByPersonName(
  consultations: ConsultationData[],
  personName: string,
): ConsultationData | undefined {
  return consultations
    .filter((consultation) => consultation.personName === personName)
    .sort((a, b) => createdAtMillis(b) - createdAtMillis(a))[0];
}

export function getLatestConsultationsByPerson(
  consultations: ConsultationData[],
): ConsultationData[] {
  const latestByPerson = new Map<string, ConsultationData>();

  [...consultations]
    .sort((a, b) => createdAtMillis(a) - createdAtMillis(b))
    .forEach((consultation) => latestByPerson.set(consultation.personName, consultation));

  return Array.from(latestByPerson.values()).sort(
    (a, b) => createdAtMillis(b) - createdAtMillis(a),
  );
}
