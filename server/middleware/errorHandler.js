import { env } from '../config/env.js';

export function notFound(req, res) {
  res.status(404).json({ message: 'Route not found.' });
}

// Express identifies error middleware by its four arguments.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
    ? error.status : 500;
  const message = error.type === 'entity.parse.failed'
    ? 'Invalid JSON body.'
    : status >= 500 || env.nodeEnv === 'production'
      ? 'Request could not be processed.'
      : error.message;
  res.status(status).json({ message });
}
