
const express = require('express')
const router = express.Router()
const auth = require('../models/user')
const bcrypt = require('bcrypt')

//SQ3.db.run('CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, userName TEXT NOT NULL, password TEXT NOT NULL, access TEXT NOT NULL)')

router.get('/', (req, res) => {
    console.log(req.user)
    res.render('users/welcome', { Users: req.user })
})

router.get('/register', async (req, res) => {
    res.render('users/register')
})

router.post('/register', async (req, res) => {
    const userName = req.body.userName
    const password = req.body.password

    // Check if username already exists.
    let userList = await auth.usernameExists(userName)
    if (userList == false) {
        // New User
        await auth.addUser({ userName, password, access: "dev" })
        res.render('users/registrationSuccess')
    } else {
        res.send(req.body.userName + req.body.password)
    }

})

router.get('/login', async (req, res) => {
    console.log(req.user)
    res.render('users/login')
})

router.post('/login', async (req, res) => {

    // Get the credentials from the form.
    const { userName, password } = req.body;

    // Check the username is valid
    if (auth.usernameExists(userName)) {
        const user = await auth.authenticateUser(userName, password)
        console.log(user)
        if (user != null) {
            req.session.user = user
            if (req.session.returnTo != null) {
                const returnUrl = req.session.returnTo
                req.session.returnTo = null
                req.session.save(() => {
                    res.redirect(returnUrl)
                })
            } else {
                req.session.save(() => {
                    res.redirect('/')
                })
            }
            return
        } else {
            res.send('Authentication failed')
        }
    } else {
        res.send('Username not found')
    }

})

module.exports = router