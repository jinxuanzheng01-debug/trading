/**
 * Hash a password using scrypt
 * @param password - The plain text password to hash
 * @returns The hashed password
 * @example
 * ```ts
 * const hashedPassword = await hashPassword('user_password')
 * ```
 * @more you can configure the scrypt options in `auth.hash.scrypt`
 */
export declare function hashPassword(password: string): Promise<string>;
/**
 * Verify a password against a hashed password
 * @param hashedPassword - The hashed password to verify against
 * @param plainPassword - The plain text password to verify
 * @returns `true` if the password is valid, `false` otherwise
 * @example
 * ```ts
 * const isValid = await verifyPassword(hashedPassword, 'user_password')
 * ```
 * @more you can configure the scrypt options in `auth.hash.scrypt`
 */
export declare function verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean>;
/**
 * Check if the hash value needs a rehash or not. The rehash is required if
 * configuration settings have changed.
 * @param hashedPassword - The hashed password to check
 * @returns `true` if a rehash is needed, `false` otherwise
 * @example
 * ```ts
 * const isValid = await verifyPassword(hashedPassword, plainText)
 *
 * // Plain password is valid, and hash needs a rehash
 * if (isValid && passwordNeedsReHash(hashedPassword)) {
 *   const newHash = await hashPassword(plainText)
 * }
 * ```
 * @more you can configure the scrypt options in `auth.hash.scrypt`
 */
export declare function passwordNeedsReHash(hashedPassword: string): boolean;
