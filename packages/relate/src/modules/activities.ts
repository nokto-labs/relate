import type { StorageAdapter, TrackActivityInput, ListActivitiesOptions } from '../adapter'
import type { Activity, SchemaInput, ObjectRef } from '../types'

export class ActivitiesClient<S extends SchemaInput = SchemaInput> {
  constructor(private readonly adapter: StorageAdapter) {}

  async track(input: TrackActivityInput<S>): Promise<Activity<S>> {
    return this.adapter.trackActivity(input as TrackActivityInput) as Promise<Activity<S>>
  }

  async list(
    ref?: ObjectRef<S>,
    options?: ListActivitiesOptions,
  ): Promise<Activity<S>[]> {
    return this.adapter.listActivities(ref as { object: string; id: string } | undefined, options) as Promise<Activity<S>[]>
  }
}
