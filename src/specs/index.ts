import EventEmitter from 'emittery'

export type IEventEmitter = EventEmitter
export interface IRouteHandlerRequest<IRouteHandlerContext = unknown, Body = unknown> {
  incoming: {
    url: string
    params: { [key: string]: string }
    body: Body
    headers: object
    method: string
  }
  context: IRouteHandlerContext
  envelop: {
    id: string
    from: string
    to: string
    path: string[]
  }
}
export interface IRouteHandlerFunction<IRouteHandlerContext = unknown, Body = unknown> {
  (request: IRouteHandlerRequest<IRouteHandlerContext, Body>): Promise<unknown>
}
export interface IRouteHandler<IRouteHandlerContext = unknown, Body = unknown> {
  method?: 'get' | 'post' | 'put' | 'delete' | 'head'
  path: string
  handler: IRouteHandlerFunction<IRouteHandlerContext, Body>
}
export interface IRouteServer<A = unknown, B = unknown> {
  handlers: IRouteHandler<A, B>[]
}

// Bus
export interface IRequest<Body = unknown> {
  host: string
  method?: 'get' | 'post' | 'put' | 'delete' | 'head'
  pathname: string
  body?: Body
}
export interface IResponse<Body = unknown> {
  statusCode: number
  body: Body
}

export enum IMessageType {
  INCOMING,
  OUTGOING,
}
export interface IIncomingMessage<Body = unknown> {
  type: IMessageType.INCOMING
  payload: IRequest<Body> | IResponse<Body>
}
export interface IOutgoingMessage<Body = unknown> {
  type: IMessageType.OUTGOING
  payload: IResponse<Body> | IRequest<Body>
}

export type IRoutePacket<Body> = {
  id: string
  inReplyTo?: string
  from: string
  to: string
  path: string[]
  // 4 cases
  subject: 'REQ' | 'RES'
  message: IIncomingMessage<Body> | IOutgoingMessage<Body>
}

export interface IBusPeer<IBusPeerMeta = unknown> {
  id: string
  port: IEventEmitter
  meta: IBusPeerMeta
}
export interface IBusNode<Meta = unknown> {
  id: string
  requestHandler: (req: IRequest, pkt: IRoutePacket<any>) => Promise<IResponse>
  peers: IBusPeer[]
  meta: Meta
  emitter: IEventEmitter
}
