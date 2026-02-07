
const express = require('express')
const router = express.Router()
const auth = require('../models/user')
const bcrypt = require('bcrypt')

//SQ3.db.run('CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, userName TEXT NOT NULL, password TEXT NOT NULL, access TEXT NOT NULL)')

router.get('/', (req, res) => {
    console.log(req.user)
    res.render('users/welcome', {Users: req.user})
})

router.get('/register', async (req, res) => {
    res.render('users/register')
})

router.post('/register', async (req, res) => {
    const userName = req.body.userName
    const password = req.body.password

    // Check if username already exists.
    let userList = await SQ3.fetchFirst(SQ3.db, 'SELECT * FROM Users WHERE userName = ?', userName)
    if (userList == null){
        // New User
        const hashedPassword = await bcrypt.hash(password, 10)
        await SQ3.execute(SQ3.db, 'INSERT INTO Users(userName, password, access) VALUES (?,?,?)', [userName, hashedPassword, "dev"])
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
    const {userName, password} = req.body;

    // Check the username is valid
    if (auth.usernameExists(userName)) {
        const user = await auth.authenticateUser(userName, password)
        console.log(user)
        if (user != null) {
            req.session.user = {
                id: user.id
            }
            req.session.save()
            res.redirect('/')
        } else {
            res.send('Authentication failed')
        }
    } else {
        res.send('Username not found')
    }
    
})

module.exports = router