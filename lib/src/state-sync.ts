import { cloneDeep } from 'lodash';

import { IStorageSyncOptions } from './interfaces/storage-sync-options';

/**
 * @internal Blacklisting
 * @returns returns the filtered state
 */
export const excludeKeysFromState = <T>(state: Partial<T>, excludeKeys?: string[]): Partial<T> => {
  if (!excludeKeys) {
    return state;
  }

  const keyPairs = excludeKeys.map(key => ({
    rootKey: key.split('.')[0],
    nestedKey: key.split('.')[1]
  }));

  for (const key in state) {
    if (state.hasOwnProperty(key)) {
      const keyPair = keyPairs.find(pair => pair.rootKey === key);
      const rootKey = keyPair ? keyPair.rootKey : null;
      const nestedKey = keyPair ? keyPair.nestedKey : null;

      switch (typeof state[key]) {
        case 'object': {
          if (rootKey && !state[key]) {
            continue;
          } else if (rootKey && nestedKey) {
            excludeKeysFromState<T>(state[key], [...excludeKeys, nestedKey]);
          } else if (rootKey) {
            delete state[key];
          } else {
            excludeKeysFromState<T>(state[key], excludeKeys);
          }
          break;
        }
        default: {
          if (rootKey) {
            delete state[key];
          }
        }
      }
    }
  }
  return state;
};

/**
 * @internal Remove empty objects from state
 * @returns returns the cleaned state
 */
export const cleanState = <T>(state: Partial<T>): Partial<T> => {
  for (const key in state) {
    if (!state[key] || typeof state[key] !== 'object') {
      continue;
    }

    cleanState<T>(state[key]);

    if (!Object.keys(state[key]).length) {
      delete state[key];
    }
  }
  return state;
};

/**
 * @internal Sync state with storage
 * @param state the next state
 * @param options the configurable options
 * @returns returns the next state
 */
export const stateSync = <T>(
  state: T,
  { features, storage, storageKeySerializer, storageError }: IStorageSyncOptions<T>
): T => {
  features
    .filter(({ stateKey, shouldSync }) => (shouldSync ? shouldSync(state[stateKey], state) : true))
    .forEach(
      ({ stateKey, excludeKeys, storageKeySerializerForFeature, serialize, storageForFeature }) => {
        const featureState = cloneDeep<Partial<T>>(state[stateKey]);
        const filteredState = cleanState(excludeKeysFromState(featureState, excludeKeys));

        if (!Object.keys(filteredState).length) {
          return;
        }

        const key = storageKeySerializerForFeature
          ? storageKeySerializerForFeature(stateKey)
          : storageKeySerializer(stateKey);

        const value = serialize ? serialize(filteredState) : JSON.stringify(filteredState);

        try {
          if (storageForFeature) {
            storageForFeature.setItem(key, value);
          } else {
            storage.setItem(key, value);
          }
        } catch (e) {
          if (storageError) {
            storageError(e);
          } else {
            throw e;
          }
        }
      }
    );

  return state;
};
