import { CONTACT_EMAIL } from '../src/config/availability.js';

export default function legalOperator(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(410).json({
    message: 'Solicita la información del responsable por el canal de atención.',
    email: CONTACT_EMAIL,
  });
}
