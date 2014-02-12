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
        var len = plug.init.apply(skr, args);
        console.log(len);

        var actor = function( pos ) {
            var d = (pos > len) ? len : pos;    // delta
            plug.actor(elem, d / len * 100 + '%', d, args);
            return d;
        };
        return { fly: actor };
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
    console.log(this.tree);
    this.tree.fly( pos );
};

var skr = new Skr();
skr.plugin({
    'name': 'slide',
    'init': function(elem) {
        // hiding element
        elem.css('position', 'fixed');
        elem.css('top', '100%');
        return elem.outerHeight();
    },
    'actor': function(elem, per, pos) {
        elem.css('transform', 'translate(0,-' + per + ')');
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
