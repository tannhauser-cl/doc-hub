/**
 * locking.gs — Document lock/unlock operations
 */

/**
 * Locks a document by setting locked_by and locked_until in the Registry.
 * Uses defaultTtlMinutes from tenant config if ttlMinutes is not provided.
 * @param {string} fileId
 * @param {string} lockedBy
 * @param {number|null} ttlMinutes
 * @returns {{lockedUntil: string}}
 */
function lockDoc(fileId, lockedBy, ttlMinutes) {
  const reg = registryFind(fileId);
  if (!reg) throw { code: 'NOT_IN_REGISTRY', message: `File ${fileId} is not in the Registry.` };

  // Check for existing active lock
  const existingLock = checkLock(fileId);
  if (existingLock && existingLock.lockedBy !== lockedBy) {
    throw {
      code: 'ALREADY_LOCKED',
      message: `Document is already locked by ${existingLock.lockedBy} until ${existingLock.lockedUntil}`
    };
  }

  const ttl = ttlMinutes || getCfgVal('lock.defaultTtlMinutes', 30);
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttl * 60 * 1000).toISOString();

  registryUpdate(fileId, {
    locked_by: lockedBy,
    locked_until: lockedUntil,
    last_edited_by: lockedBy,
    last_edited_at: now.toISOString()
  });

  auditLog('lockDoc', fileId, reg.doc_id, lockedBy,
    { lockedBy, lockedUntil, ttlMinutes: ttl },
    { action: 'unlockDoc', fileId, description: `Unlock document ${fileId}` }
  );

  return { lockedUntil };
}

/**
 * Unlocks a document. Only the lock owner or the admin email can unlock.
 * @param {string} fileId
 * @param {string} unlockedBy
 * @returns {{ok: true}}
 */
function unlockDoc(fileId, unlockedBy) {
  const reg = registryFind(fileId);
  if (!reg) throw { code: 'NOT_IN_REGISTRY', message: `File ${fileId} is not in the Registry.` };

  const cfg = getConfig();
  const adminEmail = cfg.adminEmail || '';

  const lock = checkLock(fileId);
  if (!lock) {
    // Already unlocked — idempotent
    return { ok: true };
  }

  if (lock.lockedBy !== unlockedBy && unlockedBy !== adminEmail) {
    throw {
      code: 'UNAUTHORIZED_UNLOCK',
      message: `Only the lock owner (${lock.lockedBy}) or admin can unlock this document.`
    };
  }

  const now = new Date().toISOString();
  registryUpdate(fileId, {
    locked_by: '',
    locked_until: '',
    last_edited_by: unlockedBy,
    last_edited_at: now
  });

  auditLog('unlockDoc', fileId, reg.doc_id, unlockedBy,
    { unlockedBy, previousLockedBy: lock.lockedBy },
    { action: 'lockDoc', fileId, lockedBy: lock.lockedBy, description: `Re-lock document to undo` }
  );

  return { ok: true };
}

/**
 * Checks whether a document has an active lock.
 * Auto-clears expired locks from the Registry.
 * @param {string} fileId
 * @returns {{lockedBy: string, lockedUntil: string}|null}
 */
function checkLock(fileId) {
  const reg = registryFind(fileId);
  if (!reg) return null;

  const lockedBy = reg.locked_by;
  const lockedUntil = reg.locked_until;

  if (!lockedBy || !lockedUntil) return null;

  const expiresAt = new Date(lockedUntil);
  const now = new Date();

  if (now > expiresAt) {
    // Lock has expired — auto-clear
    registryUpdate(fileId, {
      locked_by: '',
      locked_until: ''
    });
    return null;
  }

  return { lockedBy, lockedUntil };
}
