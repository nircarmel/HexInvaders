// js/unit.js

export class Unit {
    constructor(team, type, strength, speed, flagCost) {
        this.team = team; // 'BLUE' or 'RED'
        this.type = type; // 'combat' or 'flag'

        if (this.type === 'flag') {
            this.strength = 0;
            this.speed = speed;
            this.isFlag = true;
            this.isObservation = false;
            this.cost = flagCost * speed;
        } else if (this.type === 'observation') {
            this.strength = 0;
            this.speed = 0;
            this.isFlag = false;
            this.isObservation = true;
            this.cost = 0;
        } else {
            this.strength = strength;
            this.speed = speed;
            this.isFlag = false;
            this.isObservation = false;
            this.cost = strength * speed;
        }

        // Active/Exhausted state for a turn
        this.hasActed = false;
    }
}
