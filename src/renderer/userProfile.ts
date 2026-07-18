import { User } from 'firebase/auth';
import type { Query, QueryGetUserByUserNameArgs, QueryGetUserByUserIdArgs } from '../types/graphql';

export type UserProfile = {
  username: string;
  photoUrl: string | null;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

const APPSYNC_ENDPOINT = process.env.APPSYNC_ENDPOINT as string;
const CLOUDFRONT_PHOTO_URL = process.env.CLOUDFRONT_PHOTO_URL as string;

const GET_USER_PROFILE_QUERY = `
  query GetUserProfile($username: ID!) {
    getUserByUserName(username: $username) {
      username
      profilePicture
      bio
    }
  }
`;

const GET_USER_BY_USERID_QUERY = `
  query GetUserByUserId($userId: ID!) {
    getUserByUserId(userId: $userId) {
      username
      profilePicture
      bio
    }
  }
`;

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function getFallbackUsername(firebaseUser: User) {
  if (firebaseUser.displayName) {
    return firebaseUser.displayName;
  }

  if (firebaseUser.email) {
    return firebaseUser.email.split('@')[0];
  }

  return 'User';
}

function normalizePhotoUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (isAbsoluteUrl(value)) {
    return value;
  }

  if (!CLOUDFRONT_PHOTO_URL) {
    return value;
  }

  return joinUrl(CLOUDFRONT_PHOTO_URL, value);
}

async function postGraphQL<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  if (!APPSYNC_ENDPOINT) {
    throw new Error(
      'APPSYNC_ENDPOINT is not configured in the renderer environment.',
    );
  }

  const response = await fetch(APPSYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`AppSync request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as GraphQLResponse<T>;

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('\n'));
  }

  if (!payload.data) {
    throw new Error('AppSync response did not include data.');
  }

  return payload.data;
}

function getCandidateUserId(firebaseUser: User) {
  return firebaseUser.uid;
}

async function fetchUserByUserId(token: string, userId: string) {
  const data = await postGraphQL<Pick<Query, 'getUserByUserId'>>(
    token,
    GET_USER_BY_USERID_QUERY,
    { userId } satisfies QueryGetUserByUserIdArgs,
  );
  return data.getUserByUserId;
}

async function fetchUserByUsername(token: string, username: string) {
  const data = await postGraphQL<Pick<Query, 'getUserByUserName'>>(
    token,
    GET_USER_PROFILE_QUERY,
    { username } satisfies QueryGetUserByUserNameArgs,
  );
  console.log(data, '<< data')
  return data.getUserByUserName;
}

export function buildFallbackProfile(firebaseUser: User): UserProfile {
  return {
    username: getFallbackUsername(firebaseUser),
    photoUrl: normalizePhotoUrl(firebaseUser.photoURL),
  };
}

export async function fetchCurrentUserProfile(
  firebaseUser: User,
  token: string,
): Promise<UserProfile> {
  const candidateUserId = getCandidateUserId(firebaseUser);

  const payload = await fetchUserByUserId(token, candidateUserId);
  console.log(payload, '<< payload')
  if (!payload) {
    return buildFallbackProfile(firebaseUser);
  }

    return {
      username:
        payload.username.trim().length > 0
          ? payload.username
          : getFallbackUsername(firebaseUser),
      photoUrl: normalizePhotoUrl(payload.profilePicture ?? firebaseUser.photoURL),
    };
  }