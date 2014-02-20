function Queue( acts ){
    this.acts = acts;
    this._sync = false;
}

Queue.prototype.animate = function( pos ){
    for( var i in this.acts ){
        pos -= this.acts[ i ].animate( pos );
        pos = ( pos < 0 ) ? 0 : pos;
    }
    return pos;
}

Queue.prototype.len = function( pos ){
    var s = 0;
    for( var i in this.acts )
        s += this.acts[ i ].len();
    this._len = s;
    return s;
}

Queue.prototype.sync = function(){
    this._sync = true;
    return this;
}

function Parallel( acts ){
    this.acts = acts;
    this._sync = false;
    this.len();  // calculate this._len
                 // (to avoid problems when we are root group)
}

Parallel.prototype.sync = function(){
    this._sync = true;
    return this;
}

Parallel.prototype.animate = function( pos ){
    var m = 0;
    for( var i in this.acts )
        if( this.acts[ i ]._sync ){
            var k = this.acts[ i ]._len / this._len;
            this.acts[ i ].animate( pos * k );  // do not change "m", one of all _must_ be non-sync
        }
        else
            m = Math.max( m, this.acts[ i ].animate( pos ) );

    return m;
}

Parallel.prototype.len = function( pos ) {
    this._len = 0;

    for( var i in this.acts )
        if( ! this.acts[ i ]._sync )   // take into account only rigid (non-fluid, non-sync) acts
            this._len = Math.max( this._len, this.acts[ i ].len() );

    return this._len;
}

function Anim( sel, elem, name, init, actor, args ){
    this._elem = elem;  // animated element returned by $(sel)
    this._name = name;  // .. plugin name, also for locks
    this._actor = actor;
    this._init = init;
    this._args = args;
    this._sync = false;
    this._morph = {};

    function XPath( elem ){
        if( elem.id !== '' )
            return 'id("' + elem.id + '")';
        if( elem === document.body )
            return elem.tagName;

        var ix = 0,
            cs = elem.parentNode.childNodes;
        for( var i= 0; i < cs.length; i++ ){
            var c = cs[ i ];
            if( c === elem )
                return XPath( elem.parentNode ) + '/' + elem.tagName + '[' + ( ix + 1 ) + ']';
            if( c.nodeType === 1 && c.tagName === elem.tagName )
                ix++;
        }
    }

    /// convert DOM and jquery objects to XPath (this._sel must be string
    if( typeof sel === 'object' )
        sel = XPath( $( sel )[ 0 ] );

    this._sel = sel;
    Anim._dom[ this._sel ] = elem;

}

Anim._dom = {};     // cache of {selector -> DOM element} binds
Anim._morphs = {};  // cache of morphs

Anim.prototype.init = function(){
    this._len = this._init.apply( this, this._args );
    /*
     * Create morph object for dealing with CSS 'transform' property — it
     * doesn't have separate properties, like transform-rotate, which could be
     * animated independently.
     */
    this._morph = {
        ux: 'px',  // units for translations
        uy: 'px',  // ..
        dx: null,  // translation delta (null indicates nontouched property)
        dy: null,  // ..
        r: null,   // rotation (always in degree)
        s: null,   // scale
    };
    return this;
}

Anim.prototype.animate = function( pos ){
    /*
     * Animate object at zero pos only if nobody was animated before.
     * Chart of some property of the object during animation:
     *
     * ^
     * |          *-----*
     * |         /       \
     * |        /         \
     * | ------*           *-------
     * |
     * +-------####-----####------------> t
     *   |     | p1       p2
     *   +-----+
     *      \_______ interpolation segment (here we call p1.animate(0))
     *
     * We must avoid calling p2.animate(0) after p1.animate(0).
     */

    locks = Anim._locks[ this._name ] || {};  // take named lock for plugin

    // we called with 0, check if we are first and can interpolate
    if( pos == 0 && locks[ this._sel ] )
        return 0;  // go away we are not first

    locks[ this._sel ] = true;                // add lock to selector
    Anim._locks[ this._name ] = locks;


    var delta = ( pos > this._len ) ? this._len : pos;

    // form data to actor (position data + setup data)
    var args = [
        this._args[ 0 ],    // element to animate
        this._morph,        // special object for CSS 'transform' property
        delta / this._len,  // percent of animation
        delta               // current position in animation in px
    ].concat( this._args.slice( 1 ) ); // .. and append this data to setup options

    this._actor.apply( this, args );
    this.bake();

    return delta;
}

/*
 * Bake morphs into CSS 'transform' property values
 */
Anim.prototype.bake = function(){
    if( ! Anim._morphs[ this._sel ] )
        Anim._morphs[ this._sel ] = [];

    var tmp = '';
    if( this._morph.dx ) tmp += 'translateX(' + Math.round( this._morph.dx ) + this._morph.ux + ')';
    if( this._morph.dy ) tmp += 'translateY(' + Math.round( this._morph.dy ) + this._morph.uy + ')';
    if( this._morph.r  ) tmp += 'rotate(' + Math.round( this._morph.r ) + 'deg)';
    if( this._morph.s  ) tmp += 'scale(' + Math.round( this._morph.s ) + ')';

    Anim._morphs[ this._sel ].push( tmp );
}

Anim.prototype.len = function(){
    return this._len;
}

Anim.prototype.sync = function(){
    this._sync = true;
    return this;
}

function Skr(){
    this.tree = null;
    this.conf = null;
}

Skr.prototype.config = function( conf ){
    this.conf = conf;
}

Skr.prototype.plugin = function( plug ){
    var init = function( sel ) {
        var elem = $( sel );

        //
        // arguments == ['selector', opt1, opt2, opt3]
        // args == [elem, opt1, opt2, opt3]
        //
        var args = [ elem ].concat( Array.prototype.slice.call( arguments, 1 ) ),
            anim = new Anim( sel, elem, plug.name, plug.init, plug.actor, args );

        //
        // set smooth animation
        //
        elem.css( 'transition', 'transform ' +
                    this.conf.trans_time + 'ms ' +
                    this.conf.trans_func + ' 0ms' );
        elem.css( '-webkit-transition', '-webkit-transform ' +
                    this.conf.trans_time + 'ms ' +
                    this.conf.trans_func + ' 0ms' );

        return anim.init();
    }
    skr[ plug.name ] = init;
};

/*
 * Animate all actors one by one
 */
Skr.prototype.queue = function( acts ){
    var frame = new Queue( acts );
    this.tree = frame;
    return frame;
};

/*
 * Animate all actors independently
 */
Skr.prototype.parallel = function( acts ){
    var frame = new Parallel( acts );
    this.tree = frame;
    return frame;
};

/*
 * Animate all frames to the given pos
 */
Skr.prototype.animate = function( pos ){
    Anim._locks = {};          // remove all locks
    Anim._morphs = {};         // reset all transformations
    this.tree.animate( pos );  // animate to target position
    for( var i in Anim._morphs )
        Anim._dom[ i ].css( "transform", Anim._morphs[ i ].join( " " ) );
};

var skr = new Skr();

skr.config({
    'trans_time': 180,       // Transition duration in ms
    'trans_func': 'ease-out' // Transition timing function
});

skr.plugin({
    'name': 'slide',
    'init': function( elem, type ){
        // hiding element
        elem.css( 'position', 'fixed' );
        elem.css( 'top', '100%' );
        elem.css( 'height', $( window ).height() );

        var h = elem.outerHeight();

        if( type == 'first' ){
            h -= $( window ).height();
            elem.css( 'top', '0' );
        }

        return h;
    },
    'actor': function( elem, m, per, pos ){
        m.dy = -pos;
    }
});

skr.plugin({
    'name': 'rotate',
    'init': function( elem, sang, eang, len ){
        //elem.css( 'transform', 'rotate(' + sang + 'deg)' );
        return len;
    },
    'actor': function( elem, m, per, pos, sang, eang ){
        m.r = sang + ( eang - sang ) * per;
        //elem.css( 'transform', 'rotate(' +  + 'deg)' );
    }
});

/*
 * Function to extract value and units from string.
 * TODO: move this to Scrowler class ?
 */
function unit( x ){
    x = x.toString();
    var r_p = /%$/,
        r_px = /px$/;

    if( x.search( r_p ) != -1 )
        return [ parseFloat( x.replace( r_p,  '' ) ), '%' ];

    return [ parseFloat( x.replace( r_px, '' ) ), 'px' ];
}

skr.plugin({
    'name': 'move',
    'init': function( elem, dx_dy, len ){
        this.dx_dy = [ unit( dx_dy[ 0 ] ),
                       unit( dx_dy[ 1 ] ) ];  // save parsed deltas
        return len;
    },
    // here we don't use "dx_dy" and "len" options, we use parsed "this.dx_dy"
    'actor': function( elem, m, per, pos ){
        if( this.dx_dy[ 0 ][ 0 ] ) {
            m.dx = this.dx_dy[ 0 ][ 0 ] * per;
            m.ux = this.dx_dy[ 0 ][ 1 ];
        }
        if( this.dx_dy[ 1 ][ 0 ] ) {
            m.dy = this.dx_dy[ 1 ][ 0 ] * per;
            m.uy = this.dx_dy[ 1 ][ 1 ];
        }
        //elem.css( 'transform', 'translate(' + this.dx_dy[ 0 ][ 0 ] * per + this.dx_dy[ 0 ][ 1 ] + ','
        //                                    + this.dx_dy[ 1 ][ 0 ] * per + this.dx_dy[ 1 ][ 1 ] + ')' );
    }
});

skr.plugin({
    'name': 'move_x',
    'init': function( elem, s, e, len ){
        this.s = unit( s );
        this.e = unit( e );

        if( this.s[ 1 ] != this.e[ 1 ] )
            throw 'Start and end values have different units';

        return len;
    },
    'actor': function( elem, m, per, pos ){
        m.dx = this.s[ 0 ] + (this.e[ 0 ] - this.s[ 0 ]) * per;
        m.ux = this.s[ 1 ];   // setup units
    }
});

skr.plugin({
    'name': 'move_y',
    'init': function( elem, s, e, len ){
        this.s = unit( s );
        this.e = unit( e );

        if( this.s[ 1 ] != this.e[ 1 ] )
            throw 'Start and end values have different units';

        return len;
    },
    'actor': function( elem, m, per, pos ){
        m.dy = this.s[ 0 ] + (this.e[ 0 ] - this.s[ 0 ]) * per;
        m.uy = this.s[ 1 ];   // setup units
    }
});

skr.plugin({
    'name': 'fade',
    'init': function( elem, sop, eop, len ){
        elem.css( 'opacity', sop );
        return len;
    },
    'actor': function( elem, m, per, pos, sop, eop ){
        elem.css( 'opacity', sop + ( eop - sop ) * per );
    },
});

skr.plugin({
    'name': 'delay',
    'init': function( elem ){
        return elem[ 0 ];
    },
    'actor': function( elem, m, per, pos ){
        // no action
    },
});
