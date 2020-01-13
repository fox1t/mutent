import { Readable, Writable, pipeline } from 'stream'

import { Entity, Mutator, createOne, readOne } from './entity'
import { Many, toStream } from './many'
import { Commit } from './write'

export interface Entities<T, O> {
  update<U, A extends any[]>(mutator: Mutator<T, U, A>, ...args: A): Entities<U, O>
  assign<E>(object: E): Entities<T & E, O>
  delete(): Entities<null, O>
  commit(): Entities<T, O>,
  unwrap(options?: O): Promise<T[]>
  // reduce: any
}

interface Context<S, T, O> {
  locked: boolean
  stream: Readable
  mapper: (data: S) => Entity<T, O>
}

function createContext<T, O> (
  stream: Readable,
  commit?: Commit<O>
): Context<T, T, O> {
  return {
    locked: false,
    stream,
    mapper: data => createOne(data, commit)
  }
}

function readContext<T, O> (
  stream: Readable,
  commit?: Commit<O>
): Context<T, T, O> {
  return {
    locked: false,
    stream,
    mapper: data => readOne(data, commit)
  }
}

function mapContext<S, T, U, O> (
  ctx: Context<S, T, O>,
  mapper: (entity: Entity<T, O>) => Entity<U, O>
): Context<S, U, O> {
  return {
    locked: false,
    stream: ctx.stream,
    mapper: (data: S) => mapper(ctx.mapper(data))
  }
}

function updateContext<S, T, O, U, A extends any[]> (
  ctx: Context<S, T, O>,
  mutator: Mutator<T, U, A>,
  args: A
): Context<S, U, O> {
  return mapContext(ctx, entity => entity.update(mutator, ...args))
}

function assignContext<S, T, E, O> (
  ctx: Context<S, T, O>,
  object: E
): Context<S, T & E, O> {
  return mapContext(ctx, entity => entity.assign(object))
}

function deleteContext<S, T, O> (
  ctx: Context<S, T, O>
): Context<S, null, O> {
  return mapContext(ctx, entity => entity.delete())
}

function commitContext<S, T, O> (
  ctx: Context<S, T, O>
): Context<S, T, O> {
  return mapContext(ctx, entity => entity.commit())
}

function unwrapContext<S, T, O> (ctx: Context<S, T, O>, options?: O) {
  return new Promise<T[]>((resolve, reject) => {
    const result: T[] = []

    pipeline(
      ctx.stream,
      new Writable({
        objectMode: true,
        write (chunk, encoding, callback) {
          ctx.mapper(chunk)
            .unwrap(options)
            .then(data => {
              result.push(data)
              callback()
            })
            .catch(callback)
        }
      }),
      err => {
        if (err) {
          reject(err)
        } else {
          resolve(result)
        }
      }
    )
  })
}

function lockContext<S, T, O> (ctx: Context<S, T, O>) {
  if (ctx.locked) {
    throw new Error('Those entities are immutable')
  }
  ctx.locked = true
  return ctx
}

function wrapContext<S, T, O> (ctx: Context<S, T, O>): Entities<T, O> {
  return {
    update: (mutator, ...args) => wrapContext(updateContext(lockContext(ctx), mutator, args)),
    assign: object => wrapContext(assignContext(lockContext(ctx), object)),
    delete: () => wrapContext(deleteContext(lockContext(ctx))),
    commit: () => wrapContext(commitContext(lockContext(ctx))),
    unwrap: options => unwrapContext(lockContext(ctx), options)
  }
}

export function createMany<T = any, O = any> (
  many: Many<T>,
  commit?: Commit<O>
): Entities<T, O> {
  return wrapContext(createContext(toStream(many), commit))
}

export function readMany<T = any, O = any> (
  many: Many<T>,
  commit?: Commit<O>
): Entities<T, O> {
  return wrapContext(readContext(toStream(many), commit))
}