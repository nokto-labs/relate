export type ErrorCode =
  | 'DUPLICATE_RECORD'
  | 'RECORD_NOT_FOUND'
  | 'RELATIONSHIP_NOT_FOUND'
  | 'LIST_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_OPERATION'

export interface ErrorDetail {
  code: ErrorCode
  message: string
  [key: string]: unknown
}

export class RelateError extends Error {
  public readonly detail: ErrorDetail

  constructor(
    public readonly status: number,
    detail: ErrorDetail,
  ) {
    super(detail.message)
    this.name = 'RelateError'
    this.detail = detail
  }

  toJSON(): ErrorDetail {
    return this.detail
  }
}

export class NotFoundError extends RelateError {
  constructor(detail: Omit<ErrorDetail, 'message'> & { message?: string }, fallbackMessage?: string) {
    const message = detail.message ?? fallbackMessage ?? 'Not found'
    super(404, { ...detail, message } as ErrorDetail)
    this.name = 'NotFoundError'
  }
}

export class DuplicateError extends RelateError {
  constructor(detail: { object: string; field: string; value: unknown }) {
    super(409, {
      code: 'DUPLICATE_RECORD',
      message: `A record with ${detail.field} = "${detail.value}" already exists`,
      object: detail.object,
      field: detail.field,
      value: detail.value,
    })
    this.name = 'DuplicateError'
  }
}

export class ValidationError extends RelateError {
  constructor(detail: Omit<ErrorDetail, 'code'> & { code?: ErrorCode }) {
    super(400, { code: detail.code ?? 'VALIDATION_ERROR', ...detail } as ErrorDetail)
    this.name = 'ValidationError'
  }
}
