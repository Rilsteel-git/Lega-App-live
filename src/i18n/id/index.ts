import { app } from './app';
import { auth } from './auth';
import { modals } from './modals';
import { pages } from './pages';
import { stats } from './stats';

export const id: Record<string, string> = { ...app, ...auth, ...modals, ...pages, ...stats };
