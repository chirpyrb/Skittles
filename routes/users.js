
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
router.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/users/login')

    // Get list of all players to show in dropdown
    const SQ3 = require('../models/sql')
    const allPlayers = await SQ3.fetchAll(SQ3.db, 'SELECT P.id, P.firstName, P.secondName, P.alias, T.teamName FROM Players P LEFT JOIN Teams T ON P.team = T.id')

    // Get linked player details
    const linkedPlayer = await auth.getPlayerForUser(req.session.user.userName)

    // Check team captain status if linked
    let team = null
    if (linkedPlayer && linkedPlayer.team) {
        const teamModel = require('../models/team')
        team = await teamModel.getTeamById(linkedPlayer.team)
    }

    res.render('users/profile', { players: allPlayers, user: req.session.user, linkedPlayer: linkedPlayer, team: team })
})

router.post('/link', async (req, res) => {
    if (!req.session.user) return res.redirect('/users/login')

    const playerId = req.body.playerId
    if (playerId) {
        await auth.linkPlayerToUser(req.session.user.userName, playerId)
        req.session.user.playerId = playerId; // Update session
        req.session.save(() => {
            res.redirect('/users/profile')
        })
    } else {
        res.redirect('/users/profile')
    }
})

router.post('/captain', async (req, res) => {
    if (!req.session.user) return res.redirect('/users/login')

    const linkedPlayer = await auth.getPlayerForUser(req.session.user.userName)
    if (linkedPlayer && linkedPlayer.team) {
        const teamModel = require('../models/team')
        const team = await teamModel.getTeamById(linkedPlayer.team)
        
        // If team currently has no captain, become captain
        if (team.captainId == null) {
            await teamModel.setTeamCaptain(linkedPlayer.team, req.session.user.id)
        }
    }
    
    res.redirect('/users/profile')
})

router.post('/profile/edit', async (req, res) => {
    if (!req.session.user) return res.redirect('/users/login')

    const linkedPlayer = await auth.getPlayerForUser(req.session.user.userName)
    if (linkedPlayer) {
        const { firstName, secondName, alias } = req.body
        const playerModel = require('../models/player')
        await playerModel.updatePlayer(linkedPlayer.id, firstName, secondName, alias)
    }

    res.redirect('/users/profile')
})

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/')
    })
})

module.exports = router