import React, { useState } from 'react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface SignInProps {
  onBack?: () => void;
}

const SignIn: React.FC<SignInProps> = ({ onBack }) => {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    if (!supabase || !isSupabaseConfigured) {
      setError('Authentication service is not configured. Please contact the administrator.');
      return;
    }

    setIsGoogleLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (signInError) {
        setError(signInError.message);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to complete Google sign-in.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabase || !isSupabaseConfigured) {
      setError('Authentication service is not configured. Please contact the administrator.');
      return;
    }

    setIsEmailLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUpMode) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          setError(signUpError.message);
        } else {
          setMessage('Account created. Check your email for verification, then sign in.');
          setIsSignUpMode(false);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to complete email authentication.');
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-700">
      <div className="pointer-events-none absolute inset-0">
        <div className="grid-overlay" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md border border-slate-200 bg-white/95 p-7 backdrop-blur-sm md:p-8">
          <p className="mb-2 text-center text-xs uppercase tracking-[0.2em] text-emerald-700">FamiliarAI</p>
          <h1 className="text-2xl font-bold text-center text-slate-900">Sign In</h1>
          <p className="mt-3 text-center text-sm text-slate-600">
            Sign in with Google or email to access FamiliarAI securely.
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || !isSupabaseConfigured}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-1.9 2.9v2.4h3.1c1.8-1.7 2.8-4.1 2.8-6.9 0-.7-.1-1.5-.2-2.2H12z" />
              <path fill="#34A853" d="M12 22c2.6 0 4.8-.9 6.4-2.5l-3.1-2.4c-.9.6-2 1-3.3 1-2.5 0-4.7-1.7-5.4-4h-3.2v2.5C5 19.8 8.2 22 12 22z" />
              <path fill="#4A90E2" d="M6.6 14.1c-.2-.6-.4-1.3-.4-2.1s.1-1.4.4-2.1V7.4H3.4C2.5 9 2 10.4 2 12s.5 3 1.4 4.6l3.2-2.5z" />
              <path fill="#FBBC05" d="M12 5.9c1.4 0 2.7.5 3.7 1.5l2.8-2.8C16.8 3 14.6 2 12 2 8.2 2 5 4.2 3.4 7.4l3.2 2.5c.7-2.3 2.9-4 5.4-4z" />
            </svg>
            {isGoogleLoading ? 'Redirecting...' : 'Continue with Google'}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">or</p>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form className="space-y-3" onSubmit={handleEmailAuth}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input-field"
              placeholder="Email"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input-field"
              placeholder="Password"
              required
              minLength={6}
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
            >
              {isEmailLoading ? 'Please wait...' : isSignUpMode ? 'Create Account' : 'Sign In with Email'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setIsSignUpMode((prev) => !prev)}
            className="mt-3 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            {isSignUpMode ? 'Already have an account? Sign in' : 'Need an account? Create one'}
          </button>

          {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {!isSupabaseConfigured && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Authentication service is not configured. See the project README for setup instructions.
            </div>
          )}

          <Button
            variant="secondary"
            className="mt-4 w-full border border-slate-200 bg-white hover:bg-slate-50"
            onClick={onBack}
          >
            Back to Landing
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default SignIn;
