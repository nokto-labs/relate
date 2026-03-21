import { describe, it, expect } from 'vitest'
import { RelateError, NotFoundError, DuplicateError, ValidationError } from '../src/errors'

describe('RelateError', () => {
  it('has correct status and detail', () => {
    const err = new RelateError(500, { code: 'VALIDATION_ERROR', message: 'test' })
    expect(err.status).toBe(500)
    expect(err.detail.code).toBe('VALIDATION_ERROR')
    expect(err.message).toBe('test')
  })

  it('serializes with toJSON()', () => {
    const err = new RelateError(400, { code: 'VALIDATION_ERROR', message: 'bad' })
    expect(err.toJSON()).toEqual({ code: 'VALIDATION_ERROR', message: 'bad' })
  })
})

describe('NotFoundError', () => {
  it('has status 404', () => {
    const err = new NotFoundError({ code: 'RECORD_NOT_FOUND', object: 'person', id: '123' })
    expect(err.status).toBe(404)
    expect(err.detail.code).toBe('RECORD_NOT_FOUND')
    expect(err.detail.object).toBe('person')
  })

  it('uses fallback message', () => {
    const err = new NotFoundError({ code: 'RECORD_NOT_FOUND' }, 'Person not found')
    expect(err.message).toBe('Person not found')
  })
})

describe('DuplicateError', () => {
  it('has status 409 with field info', () => {
    const err = new DuplicateError({ object: 'person', field: 'email', value: 'a@b.com' })
    expect(err.status).toBe(409)
    expect(err.detail.code).toBe('DUPLICATE_RECORD')
    expect(err.detail.field).toBe('email')
    expect(err.detail.value).toBe('a@b.com')
  })

  it('generates a readable message', () => {
    const err = new DuplicateError({ object: 'person', field: 'email', value: 'a@b.com' })
    expect(err.message).toContain('email')
    expect(err.message).toContain('a@b.com')
  })
})

describe('ValidationError', () => {
  it('has status 400', () => {
    const err = new ValidationError({ message: 'Missing field', field: 'email' })
    expect(err.status).toBe(400)
    expect(err.detail.code).toBe('VALIDATION_ERROR')
  })

  it('supports custom code', () => {
    const err = new ValidationError({ code: 'INVALID_OPERATION', message: 'Nope' })
    expect(err.detail.code).toBe('INVALID_OPERATION')
  })
})
