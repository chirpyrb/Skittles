
const SQ3 = require('../models/sql')
const bcrypt = require('bcrypt')

// Init 
async function initUserDatabase(params) {
    SQ3.execute(SQ3.db, 'CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, userName TEXT NOT NULL, password TEXT NOT NULL, access TEXT NOT NULL)')
}

// Core functions
async function usernameExists(username) {
    console.log(`Searching for user: ${username}`)
    const Q = await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Users WHERE userName = ?', username)
    console.log(`Found: ${Q}`)
    if (Q.userName == null){
        return false
    } else {
        return Q
    }
}

async function addUser(User) {
    console.log(User)
    const hpwd = await bcrypt.hash(User.password, 12)
    try {
        const result = await SQ3.execute(SQ3.db, 'INSERT INTO USERS(userName, password, access) VALUES (?,?,?)', [User.userName, User.password, User.access])
        return false
    } catch (err) {
        return err
    }
}

async function authenticateUser(username, password) {
    // Check a user name was provided.
    console.log(`Starting authentication user: ${username}, password ${password}`)
    if (username == null) {
        console.log('Username null')
    } else {
        // Check the user name exists. This would probably have been done before, but check anyway.
        const user = await usernameExists(username)
        if (user != null) {
            const isAuth = await bcrypt.compare(password, user.password)
            if (isAuth) {
                return user
            } else {
                return null
            }

        }
    }
}

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

// Export things, maybe only the middleware? What about new users?
module.exports = {
    initUserDatabase,
    usernameExists,
    addUser,
    authenticateUser,
    userPermissions
}