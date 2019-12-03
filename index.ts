export type Mutator<D, U> = (data: D) => U;

export type Factory<D, O> = (options?: O) => D | Promise<D>

export type Source<D, O> = D | Factory<D, O>

export type Commit<O> = (source: any, target: any, options?: O) => any;

export interface Entity<D, O> {
  update<U>(mutator: Mutator<D, U>): Entity<U, O>;
  delete(): Entity<null, O>;
  unwrap(options?: O): Promise<D>
}

interface Context<D, T, O> {
  locked: boolean;
  source: Source<D, O>;
  target: Mutator<D, T>;
  commit: Commit<O>
}

function noUndef<T> (value: T): T {
  if (value === undefined) {
    throw new Error('An entity cannot be undefined')
  }
  return value
}

function asConst<T> (data: T) {
  return () => data
}

function passthrough<T> (value: T) {
  return noUndef(value)
}

function volatile () {
  return Promise.resolve()
}

async function build<D, O> (factory: Factory<D, O>, options?: O): Promise<D> {
  return factory(options)
}

function extract<D, O> (source: Source<D, O>, options?: O): Promise<D> {
  return typeof source === 'function'
    ? build(source as any, options)
    : Promise.resolve(source)
}

function _source<D, T, O> (ctx: Context<D, T, O>, options?: O): Promise<D> {
  return extract(ctx.source, options)
}

async function _unwrap<D, T, O> (
  ctx: Context<D, T, O>,
  options?: O
): Promise<T> {
  const source = await _source(ctx, options)
  const target = ctx.target(source)
  if (source !== null || target !== null) {
    await ctx.commit(source, target, options)
  }
  return target
}

function _create<D, T, O> (
  source: Source<D, O>,
  target: Mutator<D, T>,
  commit: Commit<O>
): Context<D, T, O> {
  return {
    locked: false,
    source,
    target,
    commit
  }
}

function _update<D, T, U, O> (ctx: Context<D, T, O>, mutator: Mutator<T, U>) {
  return _create(
    ctx.source,
    (data: D) => noUndef(mutator(ctx.target(data))),
    ctx.commit
  )
}

function _delete<D, T, O> (ctx: Context<D, T, O>) {
  return _create(
    ctx.source,
    asConst(null),
    ctx.commit
  )
}

function _lock<D, T, O> (ctx: Context<D, T, O>) {
  if (ctx.locked) {
    throw new Error('This entity is immutable')
  }
  ctx.locked = true
  return ctx
}

function _wrap<D, T, O> (ctx: Context<D, T, O>): Entity<T, O> {
  return {
    update: mutator => _wrap(_update(_lock(ctx), mutator)),
    delete: () => _wrap(_delete(_lock(ctx))),
    unwrap: (options?: O) => _unwrap(_lock(ctx), options)
  }
}

export function create<D, O> (
  data: D,
  commit: Commit<O> = volatile
): Entity<D, O> {
  return _wrap(_create(null, asConst(noUndef(data)), commit))
}

export function read<D, O> (
  source: Source<D, O>,
  commit: Commit<O> = volatile
): Entity<D, O> {
  return _wrap(_create(noUndef(source), passthrough, commit))
}
