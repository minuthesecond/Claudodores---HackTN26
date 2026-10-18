/**
 * Accounts on the voicebank server (../auth.py): sign up, log in, and the token every call sends.
 *
 * Voices made before signing up have no owner yet; their ids are kept here so the visitor
 * still sees them, and signup claims them for the new account.
 */
import { useEffect, useState } from 'react'
import { VOICEBANK } from './api'

export type User = { id: string; username: string; name: string }

const TOKEN = 'unspoken.token'
const USER = 'unspoken.user'
const GUEST = 'unspoken.guestVoices'

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // private mode: signed in for this page only
  }
}

const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

export function getToken() {
  return read(TOKEN)
}

export function getUser(): User | null {
  try {
    return JSON.parse(read(USER) ?? 'null') as User | null
  } catch {
    return null
  }
}

export function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export function guestVoices(): string[] {
  try {
    return JSON.parse(read(GUEST) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function rememberGuestVoice(id: string) {
  if (getToken()) return // signed in: the server already knows it's theirs
  write(GUEST, JSON.stringify([...new Set([...guestVoices(), id])]))
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${VOICEBANK}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `${res.status} ${res.statusText}`)
  return data as T
}

function signIn({ token, user }: { token: string; user: User }) {
  write(TOKEN, token)
  write(USER, JSON.stringify(user))
  write(GUEST, null)
  changed()
  return user
}

export async function signup(username: string, password: string, name: string) {
  return signIn(await post('/auth/signup', { username, password, name, claim: guestVoices() }))
}

export async function login(username: string, password: string) {
  return signIn(await post('/auth/login', { username, password }))
}

export async function logout() {
  await post('/auth/logout', {}).catch(() => {})
  write(TOKEN, null)
  write(USER, null)
  changed()
}

/** Checks a saved token is still good (sessions last 30 days); signs out if the server says no. */
export async function verifySession() {
  if (!getToken()) return
  try {
    const res = await fetch(`${VOICEBANK}/auth/me`, { headers: authHeaders() })
    if (res.status === 401) {
      write(TOKEN, null)
      write(USER, null)
      changed()
    }
  } catch {
    // server unreachable: keep the session, try again later
  }
}

/** The signed-in user, updating on login and logout. */
export function useUser() {
  const [user, setUser] = useState(getUser)
  useEffect(() => {
    const update = () => setUser(getUser())
    listeners.add(update)
    void verifySession()
    return () => void listeners.delete(update)
  }, [])
  return user
}
