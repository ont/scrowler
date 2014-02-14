function One( acts ) {
    this.acts = acts;
}

One.prototype.fly = function( pos ) {
    for( i in this.acts ) {
        pos -= this.acts[i].fly(pos);
        pos = ( pos < 0 ) ? 0 : pos;
    }
    return pos;
}

One.prototype.len = function( pos ) {
    var s = 0;
    for( i in this.acts )
        s += this.acts[i].len();
    return s;
}

function All( acts ) {
    this.acts = acts;
    this.len();
}

All.prototype.fly = function( pos ) {
    var m = 0;
    for( i in this.acts )
        m = Math.max( m, this.acts[i].fly(pos) );
    return m;
}

All.prototype.len = function( pos ) {
    var m = 0;
    for( i in this.acts )
        m = Math.max( m, this.acts[i].len() );
    this.mlen = m;
    console.log('>>>', m);
    return m;
}

function Anim( init, actor, args ) {
    this._actor = actor;
    this._init = init;
    this._args = args;
}

Anim.prototype.init = function() {
    this._len = this._init.apply(this, this._args);
    return this;
}

Anim.prototype.fly = function( pos ) {
    var d = (pos > this._len) ? this._len : pos;   // delta

    // form data to actor (position data + setup data)
    var args = [
        this._args[0],               // element to animate
        d / this._len,               // percent of animation
        d                            // current position in animation in px
    ].concat(this._args.slice(1));   // .. and append this data to setup options

    this._actor.apply(this, args);
    return d;
}

Anim.prototype.len = function() {
    return this._len;
}

function Skr(){
    this.tree = null;
}

Skr.prototype.plugin = function( plug ){
    var init = function( sel ) {
        var elem = $(sel);

        //
        // arguments == ['selector', opt1, opt2, opt3]
        // args == [elem, opt1, opt2, opt3]
        //
        var args = [elem].concat( Array.prototype.slice.call( arguments, 1 ) );
        var anim = new Anim( plug.init, plug.actor, args );

        //
        // set smooth animation
        //
        elem.css('transition', 'transform 180ms ease-out 0ms');
        elem.css('transition', '-webkit-transform 180ms ease-out 0ms');
        return anim.init();
    }
    skr[ plug.name ] = init;
};

/*
 * Animates all actors one by one
 */
Skr.prototype.one = function( acts ){
    var frame = new One( acts );
    this.tree = frame;
    return frame;
};

/*
 * Animates all actors in parallel
 */
Skr.prototype.all = function( acts ){
    var frame = new All( acts );
    this.tree = frame;
    return frame;
};

/*
 * Animate all frames to given pos
 */
Skr.prototype.fly = function( pos ){
    this.tree.fly( pos );
};

var skr = new Skr();
skr.plugin({
    'name': 'slide',
    'init': function(elem, type) {
        // hiding element
        elem.css('position', 'fixed');
        elem.css('top', '100%');
        elem.css('height', $(window).height());

        var h = elem.outerHeight();
        if( type == 'first' ) {
            h -= $(window).height();
            elem.css('top', '0');
        }

        return h;
    },
    'actor': function(elem, per, pos) {
        elem.css('transform', 'translate(0,-' + pos + 'px)');
    }
});

skr.plugin({
    'name': 'rotate',
    'init': function(elem, sang, eang, len) {
        elem.css('transform', 'rotate(' + sang + 'deg)');
        return len;
    },
    'actor': function(elem, per, pos, sang, eang ) {
        elem.css('transform', 'rotate(' + (sang + (eang - sang) * per) + 'deg)');
    }
});

skr.plugin({
    'name': 'move',
    'init': function(elem, dx_dy ) {
        elem.css('transform', 'translate(0px,0px)');
        return Math.sqrt(Math.pow(dx_dy[0], 2) + Math.pow(dx_dy[1], 2));
    },
    'actor': function(elem, per, pos, dx_dy ) {
        elem.css('transform', 'translate('+ dx_dy[0] * per  + 'px,' + dx_dy[1] * per + 'px)');
    }
});


// $('#section2, #section3').css('height', $(window).height());
//
// skr.one([
//     skr.slide('#section2',1,2,'a'),
//     skr.slide('#section3'),
//     //skr.all(['anim2-lhand', 'anim2-rhand', 'anim2-ipad']),
//     //skr.all(['anim2-hidehands', 'anim2-showipad']),
// ]);
