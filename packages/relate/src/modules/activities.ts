import type { StorageAdapter, TrackActivityInput, ListActivitiesOptions } from '../adapter'
import type { Activity, SchemaInput, ObjectRef } from '../types'
import { RefNotFoundError, ValidationError } from '../errors'

export class ActivitiesClient<S extends SchemaInput = SchemaInput> {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly objects?: SchemaInput,
  ) {}

  async track(input: TrackActivityInput<S>): Promise<Activity<S>> {
    if (this.objects && !this.objects[input.record.object]) {
      throw new ValidationError({
        message: `Unknown activity object "${input.record.object}"`,
        field: 'record',
        object: input.record.object,
      })
    }

    const record = await this.adapter.getRecord(input.record.object, input.record.id)
    if (!record) {
      throw new RefNotFoundError({ object: input.record.object, field: 'record', id: input.record.id })
    }

    return this.adapter.trackActivity(input as TrackActivityInput) as Promise<Activity<S>>
  }

  async list(
    ref?: ObjectRef<S>,
    options?: ListActivitiesOptions,
  ): Promise<Activity<S>[]> {
    return this.adapter.listActivities(ref as { object: string; id: string } | undefined, options) as Promise<Activity<S>[]>
  }
}
