const localStategy = require('passport-local').Strategy
const bcrypt = require('bcrypt')

function initPassport(passport, getUserByUserName, getUserById) {

    const authenticateUser = async (userName, password, done) => {
        const user = await getUserByUserName(userName)
        if (user == null) {
            return done(null, false, {message: 'Username not found'})
        }
        try {
            if (await bcrypt.compare(password, user.password)) {
                return done(null, user)
            } else {
                return done(null, false, {message: 'Passowrd incorrect'})
            }
        } catch (e) {
            return done(e)
        }
    }
    passport.use(new localStategy({usernameField: 'userName'}, authenticateUser))
    passport.serializeUser((user, done) => done(null, user.id))
    passport.deserializeUser(async (id, done) => {
        return done(null, await getUserById(id))
    })
}

module.exports = initPassport