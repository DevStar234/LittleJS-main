/*
    LittleJS Platformer Example - Objects
    - Base GameObject class for objects with health
    - Crate object collides with player, can be destroyed.
    - Weapon is held by player and fires bullets with some settings.
    - Bullet is the projectile launched by a weapon.
*/

'use strict';

class GameObject extends EngineObject 
{
    constructor(pos, size, tileIndex, tileSize, angle)
    {
        super(pos, size, tileIndex, tileSize, angle);
        this.health = 0;
        this.isGameObject = 1;
        this.damageTimer = new Timer;
    }

    update()
    {
        super.update();

        // flash white when damaged
        if (!this.isDead() && this.damageTimer.isSet())
        {
            const a = .5*percent(this.damageTimer.get(), 0, .15);
            this.additiveColor = new Color(a,a,a,0);
        }
        else
            this.additiveColor = new Color(0,0,0,0);

        // kill if below level
        if (!this.isDead() && this.pos.y < -9)
            warmup ? this.destroy() : this.kill();
    }

    damage(damage, damagingObject)
    {
        ASSERT(damage >= 0);
        if (this.isDead())
            return 0;
        
        // set damage timer;
        this.damageTimer.set();
        for (const child of this.children)
            child.damageTimer && child.damageTimer.set();

        // apply damage and kill if necessary
        const newHealth = max(this.health - damage, 0);
        if (!newHealth)
            this.kill(damagingObject);

        // set new health and return amount damaged
        return this.health - (this.health = newHealth);
    }

    isDead()                { return !this.health; }
    kill(damagingObject)    { this.destroy(); }
}

///////////////////////////////////////////////////////////////////////////////

class Crate extends GameObject 
{
    constructor(pos, typeOverride) 
    { 
        super(pos, defaultObjectSize, 2, vec2(16), (randInt(4))*PI/2);

        this.color = (new Color).setHSLA(rand(),1,.8);
        this.health = 5;

        // make it a solid object for collision
        this.setCollision(1, 1);
    }

    kill()
    {
        if (this.isDestroyed)
            return;

        playSound(sound_destroyObject, this.pos);
        makeDebris(this.pos, this.color);
        this.destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

class Enemy extends GameObject 
{
    constructor(pos, typeOverride) 
    { 
        super(pos, vec2(.9,.9), 8, vec2(16));

        this.drawSize = vec2(1);
        this.color = (new Color).setHSLA(rand(), 1, .7);
        this.health = 5;
        this.bounceTime = new Timer(rand(1e3));
        this.setCollision(1);
    }

    update()
    {
        super.update();
        
        if (!player)
            return;

        // jump around randomly
        if (this.groundObject && rand() < .01 && this.pos.distance(player.pos) < 20)
        {
            this.velocity = vec2(rand(.1,-.1), rand(.4,.2));
            playSound(sound_jump, this.pos);
        }

        // damage player if touching
        if (isOverlapping(this.pos, this.size, player.pos, player.size))
            player.damage(1, this);
    }

    kill()
    {
        if (this.isDestroyed)
            return;

        ++score;
        playSound(sound_killEnemy, this.pos);
        makeDebris(this.pos, this.color, 300);
        this.destroy();
    }
       
    render()
    {
        // bounce by changing size
        const bounceTime = this.bounceTime.get()*6;
        this.drawSize = vec2(1-.1*Math.sin(bounceTime), 1+.1*Math.sin(bounceTime));

        // make bottom flush
        let bodyPos = this.pos;
        bodyPos = bodyPos.add(vec2(0,(this.drawSize.y-this.size.y)/2));
        drawTile(bodyPos, this.drawSize, this.tileIndex, this.tileSize, this.color, this.angle, this.mirror, this.additiveColor);
    }
}

///////////////////////////////////////////////////////////////////////////////

class Grenade extends GameObject
{
    constructor(pos) 
    {
        super(pos, vec2(.2), 3, vec2(8));

        this.beepTimer = new Timer(1);
        this.elasticity   = .3;
        this.friction     = .9;
        this.angleDamping = .96;
        this.renderOrder  = 1e8;
        this.setCollision(1);
    }

    update()
    {
        super.update();

        if (this.getAliveTime() > 3)
        {
            explosion(this.pos);
            this.destroy();
        }
        else if (this.beepTimer.elapsed())
        {
            playSound(sound_grenade, this.pos)
            this.beepTimer.set(1);
        }
    }
       
    render()
    {
        drawTile(this.pos, vec2(.5), this.tileIndex, this.tileSize, this.color, this.angle);

        // draw additive flash when damaged
        setBlendMode(1);
        const flash = Math.cos(this.getAliveTime()*2*PI);
        drawTile(this.pos, vec2(2), 0, vec2(16), new Color(1,0,0,.2-.2*flash));
        setBlendMode(0);
    }
}

///////////////////////////////////////////////////////////////////////////////

class Weapon extends EngineObject 
{
    constructor(pos, parent) 
    { 
        super(pos, vec2(.6), 2, vec2(8));

        // weapon settings
        this.fireRate     = 8;
        this.bulletSpeed  = .5;
        this.bulletSpread = .1;
        this.damage       = 1;

        // prepare to fire
        this.renderOrder = parent.renderOrder + 1;
        this.fireTimeBuffer = this.localAngle = 0;
        this.recoilTimer = new Timer;
        parent.addChild(parent.weapon = this, vec2(.6,0));

        // shell effect
        this.addChild(this.shellEmitter = new ParticleEmitter(
            vec2(), 0, 0, 0, .1,  // pos, emitSize, emitTime, emitRate, emiteCone
            undefined, undefined, // tileIndex, tileSize
            new Color(1,.8,.5), new Color(.9,.7,.5), // colorStartA, colorStartB
            new Color(1,.8,.5), new Color(.9,.7,.5), // colorEndA, colorEndB
            3, .1, .1, .15, .1, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
            1, .95, 1, 0, 0,    // damping, angleDamping, gravityScale, particleCone, fadeRate, 
            .1, 1              // randomness, collide, additive, randomColorLinear, renderOrder
        ));
        this.shellEmitter.elasticity = .5;
        this.shellEmitter.particleDestroyCallback = persistentParticleDestroyCallback;
    }

    update()
    {
        super.update();

        // update recoil
        if (this.recoilTimer.active())
            this.localAngle = lerp(this.recoilTimer.getPercent(), 0, this.localAngle);


        this.mirror = this.parent.mirror;
        this.fireTimeBuffer += timeDelta;
        if (this.triggerIsDown)
        {
            // try to fire
            for (; this.fireTimeBuffer > 0; this.fireTimeBuffer -= 1/this.fireRate)
            {
                // create bullet
                playSound(sound_shoot, this.pos);
                this.localAngle = -rand(.2,.15);
                this.recoilTimer.set(.4);
                const direction = vec2(this.getMirrorSign(this.bulletSpeed), 0);
                const velocity = direction.rotate(rand(1,-1)*this.bulletSpread);
                new Bullet(this.pos, this.parent, velocity, this.damage);

                // spawn shell particle
                this.shellEmitter.localAngle = -.8*this.getMirrorSign();
                this.shellEmitter.emitParticle();
            }
        }
        else
            this.fireTimeBuffer = min(this.fireTimeBuffer, 0);
    }
}

///////////////////////////////////////////////////////////////////////////////

class Bullet extends EngineObject 
{
    constructor(pos, attacker, velocity, damage) 
    { 
        super(pos, vec2());
        this.color = new Color(1,1,0);
        this.velocity = velocity;
        this.attacker = attacker;
        this.damage = damage;
        this.damping = 1;
        this.gravityScale = 0;
        this.renderOrder = 100;
        this.drawSize = vec2(.2,.5);
        this.range = 20;
        this.setCollision(1);
    }

    update()
    {
        super.update();

        // check if hit someone
        forEachObject(this.pos, this.size, (o)=>
        {
            if (o.isGameObject)
                this.collideWithObject(o)
        });

        this.angle = this.velocity.angle();
        this.range -= this.velocity.length();
        if (this.range < 0)
            this.kill();
    }
    
    collideWithObject(o)
    {
        if (o.isGameObject && o != this.attacker)
        {
            o.damage(this.damage, this);
            o.applyForce(this.velocity.scale(.1));
        }
    
        this.kill();
        return 1; 
    }

    collideWithTile(data, pos)
    {
        if (data <= 0)
            return 0;
            
        destroyTile(pos);
        this.kill();
        return 1; 
    }

    kill()
    {
        if (this.destroyed)
            return;
        this.destroy();

        // spark effects
        const emitter = new ParticleEmitter(
            this.pos, 0, .1, 100, .5, // pos, emitSize, emitTime, emitRate, emiteCone
            undefined, undefined,     // tileIndex, tileSize
            new Color(1,1,0), new Color(1,0,0), // colorStartA, colorStartB
            new Color(1,1,0), new Color(1,0,0), // colorEndA, colorEndB
            .2, .2, 0, .1, .1, // particleTime, sizeStart, sizeEnd, particleSpeed, particleAngleSpeed
            1, 1, .5, PI, .1,  // damping, angleDamping, gravityScale, particleCone, fadeRate, 
            .5, 1, 1           // randomness, collide, additive, randomColorLinear, renderOrder
        );
        emitter.trailScale = 1;
        emitter.elasticity = .3;
        emitter.angle = this.velocity.angle() + PI;
    }
}