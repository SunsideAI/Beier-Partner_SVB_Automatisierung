export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class PipedriveError extends AppError {
  constructor(message: string, public originalError?: unknown) {
    super(message, 502, 'PIPEDRIVE_ERROR');
    this.name = 'PipedriveError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, public originalError?: unknown) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.name = 'ExternalServiceError';
  }
}
