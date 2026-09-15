
const SQ3 = require('../models/sql')
const bcrypt = require('bcrypt')

// Keep the legacy initializer available; the central schema creates this table.
async function initUserDatabase(params) {
}

// Return the user record for a username, or false when it does not exist.
async function usernameExists(username) {
    const Q = await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Users WHERE userName = ?', username)
    if (Q == null) {
        return false
    } else {
        return Q
    }
}

// Hash a password and create a user account.
async function addUser(User) {
    try {
        const hash = await bcrypt.hash(User.password, 10)
        await SQ3.execute(SQ3.db,
            'INSERT INTO Users(userName, password, access) VALUES (?,?,?)',
            [User.userName, hash, User.access])
        return true
    } catch (err) {
        return err
    }
}

// Verify a username and password and return the authenticated user.
async function authenticateUser(username, password) {
    // Check a user name was provided.
    if (username == null) {
    } else {
        // Check the user name exists. This would probably have been done before, but check anyway.
        const user = await usernameExists(username)
        if (user != null && user != false) {
            const isAuth = await bcrypt.compare(password, user.password)
            if (isAuth) {
                return user
            } else {
                return null
            }

        }
    }
}

// Check whether a user has the requested access role.
async function userPermissions(username, role) {
    // Check that a username and role were provided.
    if (username == null || role == null) {
        console.log("Username or role not provided")
        return false
    } else {
        // Check the user exists.
        const user = await usernameExists(username)
        if (user != null) {
            // Check the user has the required role.
            if (user.access == role) {
                return true
            } else {
                return false
            }
        } else {
            return false
        }
    }
}

// Associate an existing player record with a user account.
async function linkPlayerToUser(username, playerId) {
    console.log(`Linking user ${username} to player ID ${playerId}`)
    try {
        await SQ3.execute(SQ3.db, 'UPDATE Users SET playerId = ? WHERE userName = ?', [playerId, username])
        return true
    } catch (err) {
        console.error(err)
        return false
    }
}

// Return the player and team linked to a username.
async function getPlayerForUser(username) {
    return await SQ3.fetchFirst(SQ3.db, 'SELECT P.*, T.teamName FROM Users U JOIN Players P ON U.playerId = P.id LEFT JOIN Teams T ON P.team = T.id WHERE U.userName = ?', username)
}

// Export things, maybe only the middleware? What about new users?
module.exports = {
    initUserDatabase,
    usernameExists,
    addUser,
    authenticateUser,
    userPermissions,
    linkPlayerToUser,
    getPlayerForUser
}