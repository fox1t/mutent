import stream from 'stream'
import { Readable, isReadable } from 'fluido'

export type Lazy<T, O = any> = ((options: Partial<O>) => T) | T

export type Value<T> =
  | Promise<T>
  | T

export type Values<T> =
  | Iterable<T>
  | AsyncIterable<T>
  | stream.Readable

export type One<T, O = any> = Lazy<Value<T>, O>

export type Many<T, O = any> = Lazy<Values<T>, O>

export type UnwrapOptions<O = {}> = Partial<O> & {
  autoCommit?: boolean
  safe?: boolean
}

export type StreamOptions<O = {}> = UnwrapOptions<O> & {
  concurrency?: number
  highWaterMark?: number
}

function unlazy<T, O> (lazy: Lazy<T, O>, options: Partial<O>): T {
  return typeof lazy === 'function'
    ? (lazy as any)(options)
    : lazy
}

function getValue<T> (value: Value<T>) {
  return Promise.resolve(value)
}

function getValues<T> (values: Values<T>) {
  return isReadable(values) ? values : Readable.from(values)
}

export function getOne<T, O> (
  one: One<T, O>,
  options: Partial<O> = {}
): Promise<T> {
  return getValue(unlazy(one, options))
}

export function getMany<T, O> (
  many: Many<T, O>,
  options: Partial<O> = {}
): stream.Readable {
  return getValues(unlazy(many, options))
}
