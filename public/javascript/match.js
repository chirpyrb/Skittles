import SQ3 from "./sql.js"

class match {
    constructor(id) {
        this.id = id;
        this.status = "uninitialised";
    }

    beginMatch() {

    }

    addScore(SQ3, score) {
        SQ3.execute(SQ3.db, 'INSERT INTO SCORES')
    }

}