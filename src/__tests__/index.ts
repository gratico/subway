import { createBus, addPeer, IRoutePacket, messageProcess } from '../index'
import EventEmitter from 'emittery'
describe('Subway', () => {
  // todo make it work with
  beforeAll(async () => {})
  test('work with sync', async () => {
    const bus = createBus('id', {}, async (req, pkt) => {
      return {
        statusCode: 200,
        body: ''
      }
    })
    const peerEmitter = new EventEmitter()
    const peer = addPeer(bus, 'peer1', peerEmitter, { type: 'master' })
    //    const incomingMessagesIterable = peer.port.events('incoming') as AsyncIterableIterator<IRoutePacket<unknown>>

    messageProcess(
      bus,
      { type: 'master' },
      {
        method: 'post',
        pathname: '/@system/worker/checkouts',
        body: []
      }
    )

    expect(bus).toBeDefined()
  })
})
