import configPromise from '@payload-config'
import { getPayload } from 'payload'

type Props = {
  params: {
    id: string
  }
}

export async function GET(req: Request, { params }: Props) {
  const payload = await getPayload({
    config: configPromise,
  })

  const staff = await payload.findByID({
    collection: 'staff',
    id: params.id,
  })

  return Response.json(staff)
}

export async function PATCH(req: Request, { params }: Props) {
  try {
    const body = await req.json()

    const payload = await getPayload({
      config: configPromise,
    })

    const updated = await payload.update({
      collection: 'staff',
      id: params.id,
      data: body,
    })

    return Response.json(updated)
  } catch (error) {
    console.error(error)

    return Response.json(
      {
        error: 'Failed to update staff member',
      },
      {
        status: 500,
      },
    )
  }
}

export async function DELETE(req: Request, { params }: Props) {
  try {
    const payload = await getPayload({
      config: configPromise,
    })

    await payload.delete({
      collection: 'staff',
      id: params.id,
    })

    return Response.json({
      success: true,
    })
  } catch (error) {
    console.error(error)

    return Response.json(
      {
        error: 'Failed to delete staff member',
      },
      {
        status: 500,
      },
    )
  }
}
