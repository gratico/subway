import EventEmitter from 'emittery'
import shortid from 'shortid'
import sift, { Query } from 'sift'
import {
  IBusNode,
  IBusPeer,
  IRequest,
  IResponse,
  IIncomingMessage,
  IMessageType,
  IOutgoingMessage,
  IRoutePacket,
} from './specs'
export type {
  IBusNode,
  IBusPeer,
  IRequest,
  IResponse,
  IIncomingMessage,
  IMessageType,
  IOutgoingMessage,
  IRoutePacket,
} from './specs'

export function createBus<Meta extends Record<string, unknown> = Record<string, unknown>>(
  id: string,
  meta: Meta,
  requestHandler: (req: IRequest, pkt: IRoutePacket<any>) => Promise<IResponse>,
) {
  const bus: IBusNode = {
    id: id,
    peers: [],
    emitter: new EventEmitter() as any,
    meta,
    requestHandler,
  }
  return bus
}

export function setHearbeats(bus: IBusNode, filterFunction: (el: IBusPeer<any>) => boolean, d = 5000) {
  const int = setInterval(async () => {
    const peers = bus.peers.filter((el) => filterFunction(el))
    const promises = peers.map(async (el) => {
      return fetchRequest(
        bus,
        {
          method: 'post',
          pathname: '/@system/bus/ping',
          host: el.id,
          body: {
            peerId: bus.id,
          },
        },
        {},
      )
    })
    await Promise.all(promises)
  }, d)
  return () => clearInterval(int)
}

export function addPeer<Meta extends Record<string, unknown> = Record<string, unknown>>(
  bus: IBusNode,
  id: string,
  connectionPort: EventEmitter,
  meta: Meta,
): IBusPeer {
  const connection = { port: connectionPort, id: id, meta }
  bus.peers.push(connection)
  return connection
}

export function getPeerByPacket(bus: IBusNode, packet: IRoutePacket<unknown>) {
  const busIndex = packet.path.findIndex((el) => el === bus.id)
  const nextPeerId = packet.path[busIndex + 1]
  const nextPeer = nextPeerId && bus.peers.find((el) => el.id === nextPeerId)
  return nextPeer
}

export async function processIncomingMessages(bus: IBusNode, peer: IBusPeer) {
  const incomingMessagesIterable = peer.port.events('incoming') as AsyncIterableIterator<IRoutePacket<unknown>>
  for await (const message of incomingMessagesIterable) {
    message.subject === 'RES' &&
      console.debug(
        `%c@bus/${message.subject}`,
        'background: seagreen;padding: 1px;border-radius: 1px;color: white;',
        message,
        //message.id + " FROM " + message.from
      )
    const packet: IRoutePacket<unknown> = message as IRoutePacket<unknown>
    const busIndex = packet.path.findIndex((el) => el === bus.id)
    // destination
    const destinationIndex = packet.path.length - 1

    if (busIndex === destinationIndex) {
      if (packet.subject === 'REQ') {
        const outgoingPkt = await reply(bus, packet)
        if (outgoingPkt) {
          const peer = getPeerByPacket(bus, outgoingPkt)
          if (peer) {
            peer.port.emit('outgoing', outgoingPkt)
          }
        }
      } else if (packet.subject === 'RES' && packet.inReplyTo) {
        const responseEventName = 'response/' + packet.inReplyTo
        peer.port.emit(responseEventName, packet)
        // do something
      }
    } else if (busIndex >= 1) {
      relay(bus, packet)
    }
  }
  console.log('processIncomingMessages done')
}

export const processOutgoingMessages = async (
  bus: IBusNode,
  peer: IBusPeer,
  sender: (pkt: IRoutePacket<unknown>) => void,
) => {
  const iterable: AsyncIterableIterator<IRoutePacket<unknown>> = peer.port.events('outgoing') as AsyncIterableIterator<
    IRoutePacket<unknown>
  >
  //  function assertTrue(condition: boolean): asserts condition {
  //    if (!condition) {
  //      throw new Error();
  //    }
  //  }
  //  let a: number | undefined;
  //  assertTrue(!!a);
  //  a.toExponential();
  //  if (!a) throw new Error("");
  //  a.toExponential();

  for await (const message of iterable) {
    message.subject === 'RES' &&
      console.debug(
        `%c@bus/${message.subject}`,
        'background: darkslategray;padding: 1px;border-radius: 1px;color: white;',
        message,
        //message.id + " TO " + message.to
      )
    sender(message)
  }
  console.log('processOutgoingMessages done')
}

export async function reply(bus: IBusNode, packet: IRoutePacket<unknown>) {
  const address = [...packet.path].reverse()
  const incomingMessage = packet.message as IIncomingMessage
  const request = incomingMessage.payload as IRequest<unknown>
  const response = await bus.requestHandler(request, packet)

  const outgoingPkt: IRoutePacket<unknown> = {
    id: packet.id + '->reply',
    from: bus.id,
    to: packet.from,
    inReplyTo: packet.id,
    subject: 'RES',
    path: address,
    message: {
      type: IMessageType.OUTGOING,
      payload: response,
    },
  }
  return outgoingPkt
}

export async function relay(bus: IBusNode, packet: IRoutePacket<unknown>): Promise<void> {
  const nextBusConnection = getPeerByPacket(bus, packet)
  if (nextBusConnection) {
    console.debug(`%c@bus/relay`, 'background: slategray;padding: 1px;border-radius: 1px;color: white;', packet)
    nextBusConnection.port.emit('outgoing', packet)
  } else {
    console.error(
      `%c@bus/relay/NO_PEER`,
      'background: slategray;padding: 1px;border-radius: 1px;color: white;',
      packet,
      bus,
    )
  }
}

export interface IFetchRouteOptions {
  path?: string[]
}

export async function messageProcess<Response = unknown, Request = unknown>(
  bus: IBusNode,
  query: Query<any>,
  request: Omit<IRequest<Request>, 'host'>,
) {
  const filterFn = sift(query)
  const list = bus.peers.map((el: any) => ({ id: el.id, ...(el.meta || {}) }))
  const matchingPeers = list.filter(filterFn)
  if (matchingPeers.length == 1) {
    return makeRequest<Response, Request>(bus, {
      ...request,
      host: matchingPeers[0].id,
    })
  } else {
    throw new Error('NON-1 peers found')
  }
}

export function makeRequest<Response = unknown, Request = unknown>(
  bus: IBusNode,
  request: IRequest<Request>,
  route?: string | string[],
) {
  const path = typeof route === 'string' ? route.split('.') : route
  return fetchRequest<Response, Request>(bus, request, {
    path: route ? path : [bus.id, request.host],
  })
}

export async function fetchRequest<Response = unknown, Request = unknown>(
  bus: IBusNode,
  request: IRequest<Request>,
  fetchOptions: IFetchRouteOptions,
): Promise<Response | undefined> {
  const outgoingPkt: IRoutePacket<IIncomingMessage<unknown>> = {
    id: shortid(),
    from: bus.id,
    to: request.host,
    path: fetchOptions.path ? fetchOptions.path : [bus.id, request.host],
    subject: 'REQ',
    message: {
      type: IMessageType.INCOMING,
      payload: request as any,
    },
  }

  if (outgoingPkt.to === bus.id) {
    const replyPkt = await reply(bus, outgoingPkt)
    return renderMessage<any>(replyPkt)
  }
  const peer = getPeerByPacket(bus, outgoingPkt)

  if (peer) {
    const responseEventName = 'response/' + outgoingPkt.id
    setTimeout(() => {
      peer.port.emit('outgoing', outgoingPkt)
    }, 0)
    const msg: IRoutePacket<Response> = (await peer.port.once(responseEventName)) as IRoutePacket<Response>

    return renderMessage<Response>(msg, outgoingPkt)
  }
}

export function renderMessage<T>(msg: IRoutePacket<unknown>, outgoingPkt?: any) {
  if (msg.message && msg.subject === 'RES' && msg.message.type == IMessageType.OUTGOING) {
    const incomingMessage: IOutgoingMessage<unknown> = msg.message
    const res: IResponse = incomingMessage.payload as IResponse
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.body as T
    } else {
      console.error(res, outgoingPkt)
      throw new Error(res.statusCode.toString() as string)
    }
  } else {
    throw new Error('UNKNOWN_MESSAGE')
  }
}
