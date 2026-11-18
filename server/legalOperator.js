import { CONTACT_EMAIL } from '../src/config/availability.js';

export const LEGAL_OPERATOR = {
  name: 'Edgar Leonardo Ortiz Diaz',
  entityType: 'natural',
  nit: '79571562-4',
  address: 'Transversal 96B 20D 70, Bogotá, Colombia',
  phone: '6015727978',
  email: CONTACT_EMAIL,
  dataEmail: CONTACT_EMAIL,
  emailVerified: true,
  identityOnRequest: true,
};

export const LEGAL_OPERATOR_COMPLETE = LEGAL_OPERATOR.emailVerified && !LEGAL_OPERATOR.identityOnRequest
  && ['name', 'entityType', 'nit', 'address', 'phone', 'email', 'dataEmail'].every(key => Boolean(LEGAL_OPERATOR[key]));
