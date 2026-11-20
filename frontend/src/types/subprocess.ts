export type Subprocess = {
  id: string
  name: string
  description: string | null
  active: boolean
  createdAt: string
  _count: {
    counterparties: number
  }
}

export type SubprocessOption = Pick<Subprocess, 'id' | 'name' | 'active'>
