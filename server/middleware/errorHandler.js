import { ApiError } from '../utils/ApiError.js';

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
    : error.type === 'entity.too.large'
      ? 'Request body exceeds the 1 MB limit.'
      : error instanceof ApiError
        ? error.message
        : 'Request could not be processed.';
  res.status(status).json({ message });
}
